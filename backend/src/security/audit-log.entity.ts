import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type AuditActorType = 'teacher' | 'student' | 'system';

/**
 * Append-only audit trail for important changes (marks, finalisation, corrections, imports, year changes).
 * Rows hold before/after snapshots, so they double as the history of each assessment and examination mark.
 */
@Entity('audit_logs')
@Index('idx_audit_entity', ['entityType', 'entityId', 'createdAt'])
@Index('idx_audit_actor', ['actorId', 'createdAt'])
@Index('idx_audit_batch', ['batchId'])
@Index('idx_audit_year_created', ['academicYearId', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'actor_type', type: 'varchar', length: 10 })
  actorType!: AuditActorType;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  /** e.g. assessment.update, exam_mark.correction, assessment.finalize, student.import */
  @Column({ name: 'action', type: 'varchar', length: 60 })
  action!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 40 })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId!: string | null;

  /** Groups the rows written by a single save/import operation. */
  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  batchId!: string | null;

  @Column({ name: 'academic_year_id', type: 'uuid', nullable: true })
  academicYearId!: string | null;

  @Column({ name: 'section_id', type: 'uuid', nullable: true })
  sectionId!: string | null;

  @Column({ name: 'before_data', type: 'jsonb', nullable: true })
  beforeData!: Record<string, unknown> | null;

  @Column({ name: 'after_data', type: 'jsonb', nullable: true })
  afterData!: Record<string, unknown> | null;

  /** Human-readable context: student name, section label, term, exam name. */
  @Column({ name: 'context', type: 'jsonb', nullable: true })
  context!: Record<string, unknown> | null;

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason!: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
