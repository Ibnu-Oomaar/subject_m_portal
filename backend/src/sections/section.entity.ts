import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import type { Relation } from 'typeorm';
import { SchoolClass } from '../classes/class.entity';

@Entity('sections')
@Unique(['classId', 'code'])
export class Section {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'class_id', type: 'uuid' })
  classId!: string;

  @ManyToOne(() => SchoolClass, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'class_id' })
  schoolClass!: Relation<SchoolClass>;

  /** Section letter, e.g. "B". */
  @Column({ name: 'code', type: 'varchar', length: 4 })
  code!: string;

  /** Display label, e.g. "1B". */
  @Column({ name: 'label', type: 'varchar', length: 12, unique: true })
  label!: string;
}
