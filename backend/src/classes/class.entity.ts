import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** A grade level, e.g. "Class 1". Sections (1B, 1C, ...) belong to a class. */
@Entity('classes')
export class SchoolClass {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'grade_level', type: 'smallint', unique: true })
  gradeLevel!: number;

  @Column({ name: 'name', type: 'varchar', length: 40 })
  name!: string;
}
