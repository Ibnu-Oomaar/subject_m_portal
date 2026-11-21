import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AcademicYear } from '../academic-years/academic-year.entity';
import { AppError, Errors } from '../common/errors';
import type { AuthContext, ResultState } from '../common/types';
import { TERM_LABELS } from '../common/types';
import { PostgresStateService } from '../database/postgres-state.service';
import { percentOf, summarize } from '../results/calculations';
import { Section } from '../sections/section.entity';
import { AuditService } from '../security/audit.service';
import { StudentsService } from '../students/students.service';
import { TeacherScopeService } from '../teachers/teachers.service';
import { ExamMark } from './exam-mark.entity';
import { Examination } from './examination.entity';

export interface ExaminationView {
  id: string;
  academicYearId: string;
  sectionId: string;
  sectionLabel: string;
  term: number;
  termLabel: string;
  name: string;
  maxMarks: number;
  examDate: string | null;
  enrolled: number;
  entered: number;
  finalized: number;
  missing: number;
  /** missing = nothing entered · partial = some students still missing · entered = all entered · finalized = all locked */
  state: ResultState;
}

interface ExamRow {
  id: string;
  academic_year_id: string;
  section_id: string;
  section_label: string;
  term: number;
  name: string;
  max_marks: string;
  exam_date: string | null;
  enrolled: string;
  entered: string;
  finalized: string;
}

const EXAM_SQL = `
  SELECT x.id, x.academic_year_id, x.section_id, sec.label AS section_label, x.term, x.name, x.max_marks,
         to_char(x.exam_date, 'YYYY-MM-DD') AS exam_date,
         (SELECT count(*) FROM enrollments e WHERE e.academic_year_id = x.academic_year_id AND e.section_id = x.section_id) AS enrolled,
         (SELECT count(*) FROM exam_marks m WHERE m.examination_id = x.id) AS entered,
         (SELECT count(*) FROM exam_marks m WHERE m.examination_id = x.id AND m.status = 'finalized') AS finalized
    FROM examinations x JOIN sections sec ON sec.id = x.section_id`;

function toView(r: ExamRow): ExaminationView {
  const enrolled = Number(r.enrolled);
  const entered = Number(r.entered);
  const finalized = Number(r.finalized);
  const state: ResultState =
    entered === 0 ? 'missing' : entered < enrolled ? 'partial' : finalized === enrolled ? 'finalized' : 'entered';
  return {
    id: r.id,
    academicYearId: r.academic_year_id,
    sectionId: r.section_id,
    sectionLabel: r.section_label,
    term: r.term,
    termLabel: TERM_LABELS[r.term as 1 | 2 | 3],
    name: r.name,
    maxMarks: Number(r.max_marks),
    examDate: r.exam_date,
    enrolled,
    entered,
    finalized,
    missing: Math.max(enrolled - entered, 0),
    state,
  };
}

export interface CreateExamInput {
  academicYearId: string;
  sectionIds: string[];
  term: number;
  name: string;
  maxMarks: number;
  examDate?: string | null;
}

@Injectable()
export class ExaminationsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly scope: TeacherScopeService,
    private readonly students: StudentsService,
    private readonly audit: AuditService,
    private readonly state: PostgresStateService,
  ) {}

  async list(auth: AuthContext, q: { academicYearId: string; sectionId?: string; term?: number }): Promise<ExaminationView[]> {
    const sectionIds = await this.scope.resolveSections(auth, q.sectionId);
    const params: unknown[] = [q.academicYearId, sectionIds];
    let where = 'x.academic_year_id = $1 AND x.section_id = ANY($2::uuid[])';
    if (q.term) {
      params.push(q.term);
      where += ` AND x.term = $${params.length}`;
    }
    const rows: ExamRow[] = await this.dataSource.query(
      `${EXAM_SQL} WHERE ${where} ORDER BY x.term, sec.label, x.exam_date NULLS LAST, x.name`,
      params,
    );
    return rows.map(toView);
  }

  /** Loads one examination the caller may access (404 if it does not exist, 403 if the section is not theirs). */
  async getAccessible(auth: AuthContext, id: string): Promise<ExaminationView> {
    const [row]: ExamRow[] = await this.dataSource.query(`${EXAM_SQL} WHERE x.id = $1`, [id]);
    if (!row) throw Errors.notFound('Examination');
    await this.scope.assertSection(auth, row.section_id);
    return toView(row);
  }

  /** One examination per selected section, all in a single transaction. */
  async create(auth: AuthContext, input: CreateExamInput): Promise<ExaminationView[]> {
    for (const sectionId of input.sectionIds) await this.scope.assertSection(auth, sectionId);
    const created = await this.dataSource.transaction(async (m) => {
      const year = await m.findOneBy(AcademicYear, { id: input.academicYearId });
      if (!year) throw Errors.notFound('Academic year');
      if (year.status === 'closed') {
        throw Errors.conflict('This academic year is closed. Examinations can no longer be created in it.', undefined, 'ACADEMIC_YEAR_CLOSED');
      }
      const duplicates: Array<{ label: string }> = await m.query(
        `SELECT sec.label FROM examinations x JOIN sections sec ON sec.id = x.section_id
          WHERE x.academic_year_id = $1 AND x.section_id = ANY($2::uuid[]) AND x.term = $3 AND lower(x.name) = lower($4)`,
        [year.id, input.sectionIds, input.term, input.name],
      );
      if (duplicates.length) {
        throw Errors.duplicate(`"${input.name}" already exists for ${TERM_LABELS[input.term as 1 | 2 | 3]} in: ${duplicates.map((d) => d.label).join(', ')}.`, {
          sections: duplicates.map((d) => d.label),
        });
      }
      const batchId = randomUUID();
      const ids: string[] = [];
      for (const sectionId of input.sectionIds) {
        const exam = await m.save(
          Examination,
          m.create(Examination, {
            academicYearId: year.id,
            sectionId,
            term: input.term,
            name: input.name,
            maxMarks: input.maxMarks,
            examDate: input.examDate ?? null,
            createdById: auth.userId,
          }),
        );
        ids.push(exam.id);
        const section = await m.findOneByOrFail(Section, { id: sectionId });
        await this.audit.log(m, {
          actor: auth,
          action: 'examination.create',
          entityType: 'examination',
          entityId: exam.id,
          batchId,
          academicYearId: year.id,
          sectionId,
          after: { name: input.name, term: input.term, maxMarks: input.maxMarks, examDate: input.examDate ?? null },
          context: { sectionLabel: section.label, examName: input.name, term: input.term, academicYear: year.label },
        });
      }
      return ids;
    });
    await this.state.invalidate(`year:${input.academicYearId}`);
    const rows: ExamRow[] = await this.dataSource.query(`${EXAM_SQL} WHERE x.id = ANY($1::uuid[]) ORDER BY sec.label`, [created]);
    return rows.map(toView);
  }

  async update(
    auth: AuthContext,
    id: string,
    patch: { name?: string; maxMarks?: number; examDate?: string | null },
  ): Promise<ExaminationView> {
    const current = await this.getAccessible(auth, id);
    await this.dataSource.transaction(async (m) => {
      const exam = await m.createQueryBuilder(Examination, 'x').setLock('pessimistic_write').where('x.id = :id', { id }).getOneOrFail();
      const [{ top, finalized }] = (await m.query(
        `SELECT max(marks) AS top, count(*) FILTER (WHERE status = 'finalized') AS finalized FROM exam_marks WHERE examination_id = $1`,
        [id],
      )) as Array<{ top: string | null; finalized: string }>;

      if (patch.maxMarks !== undefined && patch.maxMarks !== exam.maxMarks) {
        if (Number(finalized) > 0) {
          throw Errors.conflict('The maximum cannot be changed after marks have been finalized.', undefined, 'EXAM_HAS_FINALIZED_MARKS');
        }
        if (top !== null && Number(top) > patch.maxMarks) {
          throw new AppError(422, 'MAX_BELOW_EXISTING_MARKS', `A student already has ${Number(top)} marks, which is above the new maximum.`, { highestMark: Number(top) });
        }
      }
      if (patch.name !== undefined && patch.name.toLowerCase() !== exam.name.toLowerCase()) {
        const [clash] = (await m.query(
          `SELECT 1 FROM examinations WHERE academic_year_id = $1 AND section_id = $2 AND term = $3 AND lower(name) = lower($4) AND id <> $5`,
          [exam.academicYearId, exam.sectionId, exam.term, patch.name, id],
        )) as unknown[];
        if (clash) throw Errors.duplicate(`"${patch.name}" already exists for this term and section.`);
      }
      const before = { name: exam.name, maxMarks: exam.maxMarks, examDate: exam.examDate };
      const next = {
        name: patch.name ?? exam.name,
        maxMarks: patch.maxMarks ?? exam.maxMarks,
        examDate: patch.examDate === undefined ? exam.examDate : patch.examDate,
      };
      if (before.name === next.name && before.maxMarks === next.maxMarks && before.examDate === next.examDate) return;
      await m.update(Examination, { id }, next);
      await this.audit.log(m, {
        actor: auth,
        action: 'examination.update',
        entityType: 'examination',
        entityId: id,
        academicYearId: exam.academicYearId,
        sectionId: exam.sectionId,
        before,
        after: next,
        context: { sectionLabel: current.sectionLabel, examName: next.name, term: exam.term },
      });
    });
    await this.state.invalidate(`year:${current.academicYearId}`);
    return this.getAccessible(auth, id);
  }

  /** Only an examination that has no marks at all can be removed; anything with results is history. */
  async remove(auth: AuthContext, id: string): Promise<void> {
    const current = await this.getAccessible(auth, id);
    await this.dataSource.transaction(async (m) => {
      await m.createQueryBuilder(Examination, 'x').setLock('pessimistic_write').where('x.id = :id', { id }).getOneOrFail();
      if (await m.existsBy(ExamMark, { examinationId: id })) {
        throw Errors.conflict('This examination already has marks, so it is kept as part of the academic record.', undefined, 'EXAM_HAS_MARKS');
      }
      await m.delete(Examination, { id });
      await this.audit.log(m, {
        actor: auth,
        action: 'examination.delete',
        entityType: 'examination',
        entityId: id,
        academicYearId: current.academicYearId,
        sectionId: current.sectionId,
        before: { name: current.name, term: current.term, maxMarks: current.maxMarks },
        context: { sectionLabel: current.sectionLabel, examName: current.name, term: current.term },
      });
    });
    await this.state.invalidate(`year:${current.academicYearId}`);
  }

  /** The marks-entry sheet: every student of the section with their mark (or null when missing). */
  async sheet(auth: AuthContext, id: string, q: { state?: ResultState; search?: string }) {
    const exam = await this.getAccessible(auth, id);
    const [year] = (await this.dataSource.query(`SELECT id, label, status FROM academic_years WHERE id = $1`, [exam.academicYearId])) as Array<{
      id: string;
      label: string;
      status: 'planned' | 'active' | 'closed';
    }>;
    const rows: Array<{
      enrollment_id: string;
      student_id: string;
      full_name: string;
      mark_id: string | null;
      marks: string | null;
      status: 'entered' | 'finalized' | null;
      version: number | null;
      updated_at: Date | null;
    }> = await this.dataSource.query(
      `SELECT e.id AS enrollment_id, s.student_id, s.full_name, m.id AS mark_id, m.marks, m.status, m.version, m.updated_at
         FROM enrollments e
         JOIN students s ON s.id = e.student_id
         LEFT JOIN exam_marks m ON m.enrollment_id = e.id AND m.examination_id = $3
        WHERE e.academic_year_id = $1 AND e.section_id = $2
        ORDER BY s.full_name, s.student_id`,
      [exam.academicYearId, exam.sectionId, id],
    );
    const all = rows.map((r) => {
      const marks = r.marks === null ? null : Number(r.marks);
      const state: ResultState = marks === null ? 'missing' : (r.status ?? 'entered');
      return {
        enrollmentId: r.enrollment_id,
        studentId: r.student_id,
        fullName: r.full_name,
        marks,
        percent: marks === null ? null : percentOf(marks, exam.maxMarks),
        state,
        version: r.version ?? 0,
        recordId: r.mark_id,
        updatedAt: r.updated_at ? r.updated_at.toISOString() : null,
      };
    });
    const entered = all.filter((r) => r.marks !== null);
    const needle = q.search?.toLowerCase();
    return {
      examination: exam,
      academicYear: year,
      locked: year!.status === 'closed',
      summary: {
        students: all.length,
        missing: all.length - entered.length,
        entered: all.filter((r) => r.state === 'entered').length,
        finalized: all.filter((r) => r.state === 'finalized').length,
        ...summarize(entered.map((r) => r.marks as number)),
        averagePercent: entered.length ? summarize(entered.map((r) => r.percent as number)).average : null,
      },
      rows: all.filter(
        (r) => (!q.state || r.state === q.state) && (!needle || r.fullName.toLowerCase().includes(needle) || r.studentId.toLowerCase().includes(needle)),
      ),
    };
  }

  async history(auth: AuthContext, examId: string, enrollmentId: string) {
    const exam = await this.getAccessible(auth, examId);
    await this.students.assertAccess(auth, enrollmentId);
    const [mark] = (await this.dataSource.query(`SELECT id FROM exam_marks WHERE examination_id = $1 AND enrollment_id = $2`, [exam.id, enrollmentId])) as Array<{ id: string }>;
    return mark ? this.audit.history('exam_mark', mark.id) : [];
  }
}
