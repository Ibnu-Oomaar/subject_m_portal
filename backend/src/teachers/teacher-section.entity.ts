import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import type { Relation } from 'typeorm';
import { Section } from '../sections/section.entity';
import { Teacher } from './teacher.entity';

/** Which sections a teacher is responsible for. Every section-scoped request is checked against this. */
@Entity('teacher_sections')
@Unique(['teacherId', 'sectionId'])
export class TeacherSection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @ManyToOne(() => Teacher, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'teacher_id' })
  teacher!: Relation<Teacher>;

  @Column({ name: 'section_id', type: 'uuid' })
  sectionId!: string;

  @ManyToOne(() => Section, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'section_id' })
  section!: Relation<Section>;
}
