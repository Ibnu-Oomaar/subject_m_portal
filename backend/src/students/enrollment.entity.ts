import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import type { Relation } from 'typeorm';
import { AcademicYear } from '../academic-years/academic-year.entity';
import { Section } from '../sections/section.entity';
import { Student } from './student.entity';

/** A student's place in one academic year: exactly one section per student per year. */
@Entity('enrollments')
@Unique(['studentId', 'academicYearId'])
@Index('idx_enrollments_year_section', ['academicYearId', 'sectionId'])
export class Enrollment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId!: string;

  @ManyToOne(() => Student, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'student_id' })
  student!: Relation<Student>;

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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
