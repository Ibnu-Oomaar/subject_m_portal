import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { numericTransformer } from '../common/decimal';
import type { RecordStatus } from '../assessments/assessment-record.entity';
import { Enrollment } from '../students/enrollment.entity';
import { Teacher } from '../teachers/teacher.entity';
import { Examination } from './examination.entity';

/**
 * A student's mark in one examination. A row exists only when a mark has been entered, so a missing
 * row means "missing", never zero. A database trigger guarantees marks <= the examination maximum and that
 * the enrollment belongs to the examination's section and academic year.
 */
@Entity('exam_marks')
@Unique(['examinationId', 'enrollmentId'])
@Index('idx_exam_marks_enrollment', ['enrollmentId'])
@Check(`"marks" >= 0`)
@Check(`"status" IN ('entered', 'finalized')`)
export class ExamMark {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'examination_id', type: 'uuid' })
  examinationId!: string;

  @ManyToOne(() => Examination, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'examination_id' })
  examination!: Relation<Examination>;

  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId!: string;

  @ManyToOne(() => Enrollment, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'enrollment_id' })
  enrollment!: Relation<Enrollment>;

  @Column({ name: 'marks', type: 'numeric', precision: 6, scale: 2, transformer: numericTransformer })
  marks!: number;

  @Column({ name: 'status', type: 'varchar', length: 10, default: 'entered' })
  status!: RecordStatus;

  @Column({ name: 'version', type: 'integer', default: 1 })
  version!: number;

  @Column({ name: 'updated_by_id', type: 'uuid', nullable: true })
  updatedById!: string | null;

  @ManyToOne(() => Teacher, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'updated_by_id' })
  updatedBy!: Relation<Teacher> | null;

  @Column({ name: 'finalized_at', type: 'timestamptz', nullable: true })
  finalizedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
