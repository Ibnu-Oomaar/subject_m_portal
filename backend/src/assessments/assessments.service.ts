import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Errors } from '../common/errors';
import type { AuthContext, ResultState, Term } from '../common/types';
import { TERM_LABELS } from '../common/types';
import { assessmentPercent, assessmentState, assessmentTotal, isCounted, type AssessmentScores } from '../results/calculations';
import { AuditService } from '../security/audit.service';
import { TeacherScopeService } from '../teachers/teachers.service';
import { StudentsService } from '../students/students.service';
import { ASSESSMENT_CATEGORIES, ASSESSMENT_MAX_TOTAL } from './assessment-categories';
import { AssessmentCategory } from './assessment-category.entity';

const num = (v: string | number | null): number | null => (v === null || v === undefined ? null : Number(v));

export interface AssessmentRowView {
  enrollmentId: string;
  studentId: string;
  fullName: string;
  scores: AssessmentScores;
  total: number | null;
  percent: number | null;
  state: ResultState;
  /** 0 when the student has no record yet; send this back when saving. */
  version: number;
  recordId: string | null;
  updatedAt: string | null;
}

@Injectable()
export class AssessmentsService {
  constructor(
    @InjectRepository(AssessmentCategory) private readonly categories: Repository<AssessmentCategory>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly scope: TeacherScopeService,
    private readonly students: StudentsService,
    private readonly audit: AuditService,
  ) {}

  /** The fixed categories, read from the (seeded, read-only) reference table. */
  async listCategories() {
    const rows = await this.categories.find({ order: { sortOrder: 'ASC' } });
    const byCode = new Map(ASSESSMENT_CATEGORIES.map((c) => [c.code as string, c]));
    return {
      categories: rows.map((r) => ({ code: r.code, field: byCode.get(r.code)?.field ?? r.code, name: r.name, maxMarks: r.maxMarks })),
      maxTotal: rows.reduce((sum, r) => sum + r.maxMarks, 0) || ASSESSMENT_MAX_TOTAL,
    };
  }

  async sheet(
    auth: AuthContext,
    q: { academicYearId: string; sectionId: string; term: Term; state?: ResultState; search?: string },
  ) {
    await this.scope.assertSection(auth, q.sectionId);
    const [year] = (await this.dataSource.query(`SELECT id, label, status FROM academic_years WHERE id = $1`, [q.academicYearId])) as Array<{
      id: string;
      label: string;
      status: 'planned' | 'active' | 'closed';
    }>;
    if (!year) throw Errors.notFound('Academic year');
    const [section] = (await this.dataSource.query(`SELECT id, label FROM sections WHERE id = $1`, [q.sectionId])) as Array<{ id: string; label: string }>;

    const rows: Array<{
      enrollment_id: string;
      student_id: string;
      full_name: string;
      assessment_id: string | null;
      class_activities: string | null;
      homework_assignments: string | null;
      learning_materials_notebook: string | null;
      textbook: string | null;
      status: 'entered' | 'finalized' | null;
      version: number | null;
      updated_at: Date | null;
    }> = await this.dataSource.query(
      `SELECT e.id AS enrollment_id, s.student_id, s.full_name,
              a.id AS assessment_id, a.class_activities, a.homework_assignments, a.learning_materials_notebook,
              a.textbook, a.status, a.version, a.updated_at
         FROM enrollments e
         JOIN students s ON s.id = e.student_id
         LEFT JOIN assessments a ON a.enrollment_id = e.id AND a.term = $3
        WHERE e.academic_year_id = $1 AND e.section_id = $2
        ORDER BY s.full_name, s.student_id`,
      [q.academicYearId, q.sectionId, q.term],
    );

    const all: AssessmentRowView[] = rows.map((r) => {
      const scores: AssessmentScores = {
        classActivities: num(r.class_activities),
        homeworkAssignments: num(r.homework_assignments),
        learningMaterialsNotebook: num(r.learning_materials_notebook),
        textbook: num(r.textbook),
      };
      const state = assessmentState(scores, r.status === 'finalized');
      const total = assessmentTotal(scores);
      return {
        enrollmentId: r.enrollment_id,
        studentId: r.student_id,
        fullName: r.full_name,
        scores,
        total,
        percent: isCounted(state) && total !== null ? assessmentPercent(total) : null,
        state,
        version: r.version ?? 0,
        recordId: r.assessment_id,
        updatedAt: r.updated_at ? r.updated_at.toISOString() : null,
      };
    });

    const count = (s: ResultState) => all.filter((r) => r.state === s).length;
    const needle = q.search?.toLowerCase();
    const filtered = all.filter(
      (r) => (!q.state || r.state === q.state) && (!needle || r.fullName.toLowerCase().includes(needle) || r.studentId.toLowerCase().includes(needle)),
    );
    return {
      academicYear: year,
      section,
      term: q.term,
      termLabel: TERM_LABELS[q.term],
      /** In a closed year every change needs a correction reason. */
      locked: year.status === 'closed',
      maxTotal: ASSESSMENT_MAX_TOTAL,
      categories: ASSESSMENT_CATEGORIES.map((c) => ({ code: c.code, field: c.field, name: c.name, maxMarks: c.maxMarks })),
      summary: { students: all.length, missing: count('missing'), partial: count('partial'), entered: count('entered'), finalized: count('finalized') },
      rows: filtered,
    };
  }

  /** Change history of one student's assessment for a term (from the audit trail). */
  async history(auth: AuthContext, enrollmentId: string, term: Term) {
    await this.students.assertAccess(auth, enrollmentId);
    const [record] = (await this.dataSource.query(`SELECT id FROM assessments WHERE enrollment_id = $1 AND term = $2`, [enrollmentId, term])) as Array<{ id: string }>;
    return record ? this.audit.history('assessment', record.id) : [];
  }
}
