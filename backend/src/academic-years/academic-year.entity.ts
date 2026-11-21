import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type AcademicYearStatus = 'planned' | 'active' | 'closed';

@Entity('academic_years')
@Check(`"status" IN ('planned', 'active', 'closed')`)
@Index('uq_academic_years_single_active', ['status'], { unique: true, where: `"status" = 'active'` })
export class AcademicYear {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** "2026/2027" */
  @Column({ name: 'label', type: 'varchar', length: 9, unique: true })
  label!: string;

  @Column({ name: 'start_year', type: 'smallint', unique: true })
  startYear!: number;

  @Column({ name: 'status', type: 'varchar', length: 10, default: 'planned' })
  status!: AcademicYearStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
