import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('teachers')
export class Teacher {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Name as displayed (and used to sign in). */
  @Column({ name: 'name', type: 'varchar', length: 120 })
  name!: string;

  /** Lower-cased, whitespace-collapsed name used for the login lookup. */
  @Column({ name: 'name_normalized', type: 'varchar', length: 120, unique: true })
  nameNormalized!: string;

  /** Optional Argon2id hash. When set, the teacher must also supply the passcode to sign in. */
  @Column({ name: 'passcode_hash', type: 'text', nullable: true })
  passcodeHash!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
