import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AcademicYear } from '../academic-years/academic-year.entity';
import { Errors } from '../common/errors';
import type { AuthContext } from '../common/types';
import { env } from '../config/env';
import { PostgresStateService } from '../database/postgres-state.service';
import { AuditService } from '../security/audit.service';
import { TeacherScopeService } from '../teachers/teachers.service';
import { Enrollment } from './enrollment.entity';
import { Student } from './student.entity';

export interface EnrollmentContext {
  enrollmentId: string;
  studentUuid: string;
  studentId: string;
  fullName: string;
  academicYearId: string;
  academicYearLabel: string;
  academicYearStatus: 'planned' | 'active' | 'closed';
  sectionId: string;
  sectionLabel: string;
  classId: string;
  className: string;
}

interface ContextRow {
  enrollment_id: string;
  student_uuid: string;
  student_id: string;
  full_name: string;
  academic_year_id: string;
  academic_year_label: string;
  academic_year_status: 'planned' | 'active' | 'closed';
  section_id: string;
  section_label: string;
  class_id: string;
  class_name: string;
}

const CONTEXT_SQL = `
  SELECT e.id AS enrollment_id, s.id AS student_uuid, s.student_id, s.full_name,
         y.id AS academic_year_id, y.label AS academic_year_label, y.status AS academic_year_status,
         sec.id AS section_id, sec.label AS section_label, c.id AS class_id, c.name AS class_name
    FROM enrollments e
    JOIN students s ON s.id = e.student_id
    JOIN academic_years y ON y.id = e.academic_year_id
    JOIN sections sec ON sec.id = e.section_id
    JOIN classes c ON c.id = sec.class_id`;

const toContext = (r: ContextRow): EnrollmentContext => ({
  enrollmentId: r.enrollment_id,
  studentUuid: r.student_uuid,
  studentId: r.student_id,
  fullName: r.full_name,
  academicYearId: r.academic_year_id,
  academicYearLabel: r.academic_year_label,
  academicYearStatus: r.academic_year_status,
  sectionId: r.section_id,
  sectionLabel: r.section_label,
  classId: r.class_id,
  className: r.class_name,
});

export function normalizeStudentId(raw: string): string {
  return raw.normalize('NFKC').trim().toUpperCase();
}
export const isValidStudentId = (id: string): boolean => env.studentIdRegex.test(id);

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student) private readonly students: Repository<Student>,
    @InjectRepository(Enrollment) private readonly enrollments: Repository<Enrollment>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly scope: TeacherScopeService,
    private readonly audit: AuditService,
    private readonly state: PostgresStateService,
  ) {}

  findByStudentId(studentId: string): Promise<Student | null> {
    return this.students.findOneBy({ studentId });
  }

  findById(id: string): Promise<Student | null> {
    return this.students.findOneBy({ id });
  }

  async getContext(enrollmentId: string): Promise<EnrollmentContext | null> {
    const rows: ContextRow[] = await this.dataSource.query(`${CONTEXT_SQL} WHERE e.id = $1`, [enrollmentId]);
    return rows[0] ? toContext(rows[0]) : null;
  }

  /** The enrollment (with names) when it exists AND the teacher is assigned to its section; otherwise an error. */
  async assertAccess(auth: AuthContext, enrollmentId: string): Promise<EnrollmentContext> {
    const ctx = await this.getContext(enrollmentId);
    if (!ctx) throw Errors.notFound('Student enrollment');
    await this.scope.assertSection(auth, ctx.sectionId);
    return ctx;
  }

  /** A student's own enrollments across years, newest first. Used by the student dashboard. */
  async enrollmentsOfStudent(studentUuid: string): Promise<EnrollmentContext[]> {
    const rows: ContextRow[] = await this.dataSource.query(
      `${CONTEXT_SQL} WHERE s.id = $1 ORDER BY y.start_year DESC`,
      [studentUuid],
    );
    return rows.map(toContext);
  }

  async list(
    auth: AuthContext,
    q: { academicYearId: string; sectionId?: string; search?: string; page: number; pageSize: number },
  ) {
    const sectionIds = await this.scope.resolveSections(auth, q.sectionId);
    const params: unknown[] = [q.academicYearId, sectionIds];
    let where = 'e.academic_year_id = $1 AND e.section_id = ANY($2::uuid[])';
    if (q.search) {
      params.push(`%${q.search.replace(/[\\%_]/g, '\\$&')}%`);
      where += ` AND (s.full_name ILIKE $${params.length} OR s.student_id ILIKE $${params.length})`;
    }
    const from = `FROM enrollments e JOIN students s ON s.id = e.student_id JOIN sections sec ON sec.id = e.section_id WHERE ${where}`;
    const [{ n }] = (await this.dataSource.query(`SELECT count(*) AS n ${from}`, params)) as Array<{ n: string }>;
    const rows: Array<{
      enrollment_id: string;
      student_uuid: string;
      student_id: string;
      full_name: string;
      section_id: string;
      section_label: string;
      class_id: string;
    }> = await this.dataSource.query(
      `SELECT e.id AS enrollment_id, s.id AS student_uuid, s.student_id, s.full_name,
              sec.id AS section_id, sec.label AS section_label, sec.class_id
         ${from} ORDER BY sec.label, s.full_name, s.student_id
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, q.pageSize, (q.page - 1) * q.pageSize],
    );
    return {
      items: rows.map((r) => ({
        enrollmentId: r.enrollment_id,
        studentUuid: r.student_uuid,
        studentId: r.student_id,
        fullName: r.full_name,
        sectionId: r.section_id,
        sectionLabel: r.section_label,
        classId: r.class_id,
      })),
      total: Number(n),
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  /** Adds one student to a section for an academic year (reusing the student's record if the ID already exists). */
  async enroll(auth: AuthContext, dto: { academicYearId: string; sectionId: string; studentId: string; fullName: string }) {
    await this.scope.assertSection(auth, dto.sectionId);
    const studentId = normalizeStudentId(dto.studentId);
    if (!isValidStudentId(studentId)) {
      throw Errors.validation([{ path: 'studentId', message: 'This is not a valid Student ID.' }]);
    }
    const result = await this.dataSource.transaction(async (manager) => {
      const year = await manager.findOneBy(AcademicYear, { id: dto.academicYearId });
      if (!year) throw Errors.notFound('Academic year');
      if (year.status === 'closed') {
        throw Errors.conflict('This academic year is closed. Students can no longer be added to it.', undefined, 'ACADEMIC_YEAR_CLOSED');
      }
      let student = await manager.findOneBy(Student, { studentId });
      const existing = student !== null;
      if (!student) {
        student = await manager.save(Student, manager.create(Student, { studentId, fullName: dto.fullName }));
      }
      const already = await manager.findOne(Enrollment, { where: { studentId: student.id, academicYearId: year.id }, relations: { section: true } });
      if (already) {
        throw Errors.duplicate(`${studentId} is already enrolled for ${year.label} in section ${already.section.label}.`);
      }
      const enrollment = await manager.save(
        Enrollment,
        manager.create(Enrollment, { studentId: student.id, academicYearId: year.id, sectionId: dto.sectionId }),
      );
      await this.audit.log(manager, {
        actor: auth,
        action: 'enrollment.create',
        entityType: 'enrollment',
        entityId: enrollment.id,
        academicYearId: year.id,
        sectionId: dto.sectionId,
        after: { studentId, fullName: student.fullName },
        context: { studentId, fullName: student.fullName, academicYear: year.label },
      });
      return { enrollment, student, existing };
    });
    await this.state.invalidate(`year:${dto.academicYearId}`);
    return {
      enrollmentId: result.enrollment.id,
      studentId: result.student.studentId,
      fullName: result.student.fullName,
      existingStudent: result.existing,
    };
  }

  /** Corrects a student's name everywhere (history keeps pointing at the same student). */
  async rename(auth: AuthContext, enrollmentId: string, fullName: string) {
    const ctx = await this.assertAccess(auth, enrollmentId);
    if (ctx.fullName === fullName) return { enrollmentId, fullName };
    await this.dataSource.transaction(async (manager) => {
      await manager.update(Student, { id: ctx.studentUuid }, { fullName });
      await this.audit.log(manager, {
        actor: auth,
        action: 'student.rename',
        entityType: 'student',
        entityId: ctx.studentUuid,
        academicYearId: ctx.academicYearId,
        sectionId: ctx.sectionId,
        before: { fullName: ctx.fullName },
        after: { fullName },
        context: { studentId: ctx.studentId },
      });
    });
    const years: Array<{ academic_year_id: string }> = await this.dataSource.query(
      `SELECT DISTINCT academic_year_id FROM enrollments WHERE student_id = $1`,
      [ctx.studentUuid],
    );
    await Promise.all(years.map((y) => this.state.invalidate(`year:${y.academic_year_id}`)));
    return { enrollmentId, fullName };
  }
}
