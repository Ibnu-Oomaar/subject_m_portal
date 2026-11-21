import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { numericTransformer } from '../common/decimal';
import { Enrollment } from '../students/enrollment.entity';
import { Teacher } from '../teachers/teacher.entity';

export type RecordStatus = 'entered' | 'finalized';

/**
 * One continuous-assessment record per student, academic year (via enrollment) and term.
 * NULL in a category means "not entered yet" - it is never treated as zero.
 */
@Entity('assessments')
@Unique(['enrollmentId', 'term'])
@Index('idx_assessments_enrollment', ['enrollmentId'])
@Check(`"term" BETWEEN 1 AND 3`)
@Check(`"class_activities" IS NULL OR ("class_activities" >= 0 AND "class_activities" <= 9)`)
@Check(`"homework_assignments" IS NULL OR ("homework_assignments" >= 0 AND "homework_assignments" <= 6)`)
@Check(`"learning_materials_notebook" IS NULL OR ("learning_materials_notebook" >= 0 AND "learning_materials_notebook" <= 10)`)
@Check(`"textbook" IS NULL OR ("textbook" >= 0 AND "textbook" <= 5)`)
@Check(`"status" IN ('entered', 'finalized')`)
export class AssessmentRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId!: string;

  @ManyToOne(() => Enrollment, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'enrollment_id' })
  enrollment!: Relation<Enrollment>;

  @Column({ name: 'term', type: 'smallint' })
  term!: number;

  @Column({ name: 'class_activities', type: 'numeric', precision: 4, scale: 2, nullable: true, transformer: numericTransformer })
  classActivities!: number | null;

  @Column({ name: 'homework_assignments', type: 'numeric', precision: 4, scale: 2, nullable: true, transformer: numericTransformer })
  homeworkAssignments!: number | null;

  @Column({ name: 'learning_materials_notebook', type: 'numeric', precision: 4, scale: 2, nullable: true, transformer: numericTransformer })
  learningMaterialsNotebook!: number | null;

  @Column({ name: 'textbook', type: 'numeric', precision: 4, scale: 2, nullable: true, transformer: numericTransformer })
  textbook!: number | null;

  @Column({ name: 'status', type: 'varchar', length: 10, default: 'entered' })
  status!: RecordStatus;

  /** Optimistic-concurrency counter, incremented on every change. */
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
