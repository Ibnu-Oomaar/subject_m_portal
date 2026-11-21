import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * A student's identity. It is kept across academic years; where the student sits in a given year
 * (class section) is an Enrollment, so history is never lost when a new year starts.
 */
@Entity('students')
export class Student {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Login identifier, stored upper-case. */
  @Column({ name: 'student_id', type: 'varchar', length: 32, unique: true })
  studentId!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 150 })
  fullName!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
