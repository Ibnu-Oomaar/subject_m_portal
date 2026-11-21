import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Errors } from '../common/errors';
import type { AuthContext } from '../common/types';
import { RedisService } from '../redis/redis.service';
import { AuditService } from '../security/audit.service';
import { AcademicYear } from './academic-year.entity';

export interface AcademicYearView {
  id: string;
  label: string;
  startYear: number;
  status: AcademicYear['status'];
  createdAt: string;
  /** Students enrolled in the caller's sections for this year. */
  studentCount: number;
}

/**
 * Academic years are only ever created, activated and closed. There is deliberately no delete operation, and
 * every foreign key pointing at academic_years is ON DELETE RESTRICT, so history cannot be lost.
 */
@Injectable()
export class AcademicYearsService {
  constructor(
    @InjectRepository(AcademicYear) private readonly years: Repository<AcademicYear>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
  ) {}

  async list(sectionIds: string[]): Promise<AcademicYearView[]> {
    const rows: Array<{ id: string; label: string; start_year: number; status: AcademicYear['status']; created_at: Date; n: string }> =
      await this.dataSource.query(
        `SELECT y.id, y.label, y.start_year, y.status, y.created_at, COALESCE(c.n, 0) AS n
           FROM academic_years y
           LEFT JOIN (SELECT academic_year_id, count(*) AS n FROM enrollments
                       WHERE section_id = ANY($1::uuid[]) GROUP BY academic_year_id) c ON c.academic_year_id = y.id
          ORDER BY y.start_year DESC`,
        [sectionIds],
      );
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      startYear: Number(r.start_year),
      status: r.status,
      createdAt: r.created_at.toISOString(),
      studentCount: Number(r.n),
    }));
  }

  async getOrFail(id: string): Promise<AcademicYear> {
    const year = await this.years.findOneBy({ id });
    if (!year) throw Errors.notFound('Academic year');
    return year;
  }

  async getActive(): Promise<AcademicYear | null> {
    return this.years.findOneBy({ status: 'active' });
  }

  /** The first year ever created becomes active automatically; later years start as "planned". */
  async create(auth: AuthContext, label: string): Promise<AcademicYear> {
    const startYear = Number(label.slice(0, 4));
    if (await this.years.existsBy({ label })) throw Errors.duplicate(`Academic year ${label} already exists.`);
    return this.dataSource.transaction(async (manager) => {
      const hasActive = await manager.existsBy(AcademicYear, { status: 'active' });
      const year = await manager.save(
        AcademicYear,
        manager.create(AcademicYear, { label, startYear, status: hasActive ? 'planned' : 'active' }),
      );
      await this.audit.log(manager, {
        actor: auth,
        action: 'academic_year.create',
        entityType: 'academic_year',
        entityId: year.id,
        academicYearId: year.id,
        after: { label: year.label, status: year.status },
      });
      return year;
    });
  }

  /** Activating a year closes the previously active one (only one year can be active at a time). */
  async activate(auth: AuthContext, id: string): Promise<AcademicYear> {
    const year = await this.getOrFail(id);
    if (year.status === 'active') return year;
    const updated = await this.dataSource.transaction(async (manager) => {
      const previous = await manager.findOneBy(AcademicYear, { status: 'active' });
      if (previous) {
        await manager.update(AcademicYear, { id: previous.id }, { status: 'closed' });
        await this.audit.log(manager, {
          actor: auth,
          action: 'academic_year.close',
          entityType: 'academic_year',
          entityId: previous.id,
          academicYearId: previous.id,
          before: { status: 'active' },
          after: { status: 'closed' },
          reason: `Closed because ${year.label} was activated`,
        });
      }
      await manager.update(AcademicYear, { id }, { status: 'active' });
      await this.audit.log(manager, {
        actor: auth,
        action: 'academic_year.activate',
        entityType: 'academic_year',
        entityId: id,
        academicYearId: id,
        before: { status: year.status },
        after: { status: 'active' },
      });
      return manager.findOneByOrFail(AcademicYear, { id });
    });
    await this.redis.invalidate(`year:${id}`);
    return updated;
  }

  async close(auth: AuthContext, id: string): Promise<AcademicYear> {
    const year = await this.getOrFail(id);
    if (year.status !== 'active') throw Errors.conflict('Only the active academic year can be closed.');
    const updated = await this.dataSource.transaction(async (manager) => {
      await manager.update(AcademicYear, { id }, { status: 'closed' });
      await this.audit.log(manager, {
        actor: auth,
        action: 'academic_year.close',
        entityType: 'academic_year',
        entityId: id,
        academicYearId: id,
        before: { status: 'active' },
        after: { status: 'closed' },
      });
      return manager.findOneByOrFail(AcademicYear, { id });
    });
    await this.redis.invalidate(`year:${id}`);
    return updated;
  }

  /** Per-section counts for one year, limited to the caller's sections. */
  async summary(id: string, sectionIds: string[]) {
    const year = await this.getOrFail(id);
    const rows: Array<{
      section_id: string;
      label: string;
      students: string;
      exams: string;
      assessments_entered: string;
      assessments_finalized: string;
    }> = await this.dataSource.query(
      `SELECT sec.id AS section_id, sec.label,
              (SELECT count(*) FROM enrollments e WHERE e.academic_year_id = $1 AND e.section_id = sec.id) AS students,
              (SELECT count(*) FROM examinations x WHERE x.academic_year_id = $1 AND x.section_id = sec.id) AS exams,
              (SELECT count(*) FROM assessments a JOIN enrollments e ON e.id = a.enrollment_id
                WHERE e.academic_year_id = $1 AND e.section_id = sec.id) AS assessments_entered,
              (SELECT count(*) FROM assessments a JOIN enrollments e ON e.id = a.enrollment_id
                WHERE e.academic_year_id = $1 AND e.section_id = sec.id AND a.status = 'finalized') AS assessments_finalized
         FROM sections sec WHERE sec.id = ANY($2::uuid[]) ORDER BY sec.label`,
      [id, sectionIds],
    );
    return {
      id: year.id,
      label: year.label,
      status: year.status,
      sections: rows.map((r) => ({
        sectionId: r.section_id,
        label: r.label,
        students: Number(r.students),
        examinations: Number(r.exams),
        assessmentRecords: Number(r.assessments_entered),
        assessmentRecordsFinalized: Number(r.assessments_finalized),
      })),
    };
  }
}
