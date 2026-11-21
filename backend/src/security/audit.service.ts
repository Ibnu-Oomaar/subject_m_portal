import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthContext } from '../common/types';
import { AuditLog } from './audit-log.entity';

export interface AuditEntry {
  actor: AuthContext | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  batchId?: string | null;
  academicYearId?: string | null;
  sectionId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  context?: Record<string, unknown> | null;
  reason?: string | null;
}

export interface AuditHistoryItem {
  id: string;
  action: string;
  at: string;
  actorName: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
}

export interface ActivityItem {
  batchId: string | null;
  action: string;
  entityType: string;
  count: number;
  at: string;
  context: Record<string, unknown> | null;
  actorName: string | null;
}

@Injectable()
export class AuditService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Writes inside the caller's transaction so a change and its audit trail commit (or roll back) together. */
  async log(manager: EntityManager, entries: AuditEntry | AuditEntry[]): Promise<void> {
    const list = Array.isArray(entries) ? entries : [entries];
    if (!list.length) return;
    const rows = list.map((e) =>
      manager.create(AuditLog, {
        actorType: e.actor?.role ?? 'system',
        actorId: e.actor?.userId ?? null,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId ?? null,
        batchId: e.batchId ?? null,
        academicYearId: e.academicYearId ?? null,
        sectionId: e.sectionId ?? null,
        beforeData: e.before ?? null,
        afterData: e.after ?? null,
        context: e.context ?? null,
        reason: e.reason ?? null,
        ipAddress: e.actor?.ip ?? null,
      }),
    );
    await manager.save(AuditLog, rows);
  }

  /** Full change history of one record (assessment or examination mark), newest first. */
  async history(entityType: string, entityId: string, limit = 100): Promise<AuditHistoryItem[]> {
    const rows: Array<{
      id: string;
      action: string;
      created_at: Date;
      actor_name: string | null;
      before_data: Record<string, unknown> | null;
      after_data: Record<string, unknown> | null;
      reason: string | null;
    }> = await this.dataSource.query(
      `SELECT a.id, a.action, a.created_at, t.name AS actor_name, a.before_data, a.after_data, a.reason
         FROM audit_logs a LEFT JOIN teachers t ON t.id = a.actor_id
        WHERE a.entity_type = $1 AND a.entity_id = $2
        ORDER BY a.created_at DESC, a.id DESC LIMIT $3`,
      [entityType, entityId, limit],
    );
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      at: r.created_at.toISOString(),
      actorName: r.actor_name,
      before: r.before_data,
      after: r.after_data,
      reason: r.reason,
    }));
  }

  /** Recent data-entry activity of a teacher, with each save/import operation collapsed to one line. */
  async recentActivity(teacherId: string, academicYearId: string, limit = 10): Promise<ActivityItem[]> {
    const rows: Array<{
      batch_id: string | null;
      action: string;
      entity_type: string;
      n: string;
      at: Date;
      context: Record<string, unknown> | null;
      actor_name: string | null;
    }> = await this.dataSource.query(
      `SELECT a.batch_id, a.action, a.entity_type, count(*) AS n, max(a.created_at) AS at,
              (array_agg(a.context ORDER BY a.created_at DESC))[1] AS context, max(t.name) AS actor_name
         FROM audit_logs a LEFT JOIN teachers t ON t.id = a.actor_id
        WHERE a.actor_id = $1 AND a.academic_year_id = $2
        GROUP BY COALESCE(a.batch_id::text, a.id::text), a.batch_id, a.action, a.entity_type
        ORDER BY max(a.created_at) DESC LIMIT $3`,
      [teacherId, academicYearId, limit],
    );
    return rows.map((r) => ({
      batchId: r.batch_id,
      action: r.action,
      entityType: r.entity_type,
      count: Number(r.n),
      at: r.at.toISOString(),
      context: r.context,
      actorName: r.actor_name,
    }));
  }
}
