import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { AcademicYear } from '../academic-years/academic-year.entity';
import { numericTransformer } from '../common/decimal';
import { Section } from '../sections/section.entity';
import { Teacher } from '../teachers/teacher.entity';

/** A teacher-configured examination. The maximum marks are data, never hardcoded. */
@Entity('examinations')
@Unique(['academicYearId', 'sectionId', 'term', 'name'])
@Index('idx_examinations_year_section_term', ['academicYearId', 'sectionId', 'term'])
@Check(`"term" BETWEEN 1 AND 3`)
@Check(`"max_marks" > 0 AND "max_marks" <= 1000`)
export class Examination {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'academic_year_id', type: 'uuid' })
  academicYearId!: string;

  @ManyToOne(() => AcademicYear, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'academic_year_id' })
  academicYear!: Relation<AcademicYear>;

  @Column({ name: 'section_id', type: 'uuid' })
  sectionId!: string;

  @ManyToOne(() => Section, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'section_id' })
  section!: Relation<Section>;

  /** 1 = Term 1, 2 = Term 2, 3 = Final Term 3 */
  @Column({ name: 'term', type: 'smallint' })
  term!: number;

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'max_marks', type: 'numeric', precision: 6, scale: 2, transformer: numericTransformer })
  maxMarks!: number;

  /** YYYY-MM-DD */
  @Column({ name: 'exam_date', type: 'date', nullable: true })
  examDate!: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById!: string | null;

  @ManyToOne(() => Teacher, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: Relation<Teacher> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
