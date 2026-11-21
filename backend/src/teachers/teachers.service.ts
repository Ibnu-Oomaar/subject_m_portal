import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Errors } from '../common/errors';
import type { AuthContext } from '../common/types';
import { Section } from '../sections/section.entity';
import { TeacherSection } from './teacher-section.entity';
import { Teacher } from './teacher.entity';

export function normalizeTeacherName(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

@Injectable()
export class TeachersService {
  constructor(
    @InjectRepository(Teacher) private readonly teachers: Repository<Teacher>,
    @InjectRepository(TeacherSection) private readonly assignments: Repository<TeacherSection>,
    @InjectRepository(Section) private readonly sections: Repository<Section>,
  ) {}

  findByName(name: string): Promise<Teacher | null> {
    return this.teachers.findOneBy({ nameNormalized: normalizeTeacherName(name) });
  }

  findById(id: string): Promise<Teacher | null> {
    return this.teachers.findOneBy({ id });
  }

  async verifyPasscode(teacher: Teacher, passcode: string | undefined): Promise<boolean> {
    if (!teacher.passcodeHash) return true;
    if (!passcode) return false;
    return Bun.password.verify(passcode, teacher.passcodeHash);
  }

  /** Used by the seed script only: there is intentionally no public teacher registration. */
  async create(input: { name: string; passcode?: string; sectionLabels?: string[] }): Promise<Teacher> {
    const name = input.name.normalize('NFC').trim().replace(/\s+/g, ' ');
    if (!name) throw Errors.badRequest('A teacher name is required.');
    const teacher = await this.teachers.save(
      this.teachers.create({
        name,
        nameNormalized: normalizeTeacherName(name),
        passcodeHash: input.passcode ? await Bun.password.hash(input.passcode, 'argon2id') : null,
        isActive: true,
      }),
    );
    const sections = input.sectionLabels?.length
      ? await this.sections.findBy({ label: In(input.sectionLabels) })
      : await this.sections.find();
    await this.assignments.save(sections.map((s) => this.assignments.create({ teacherId: teacher.id, sectionId: s.id })));
    return teacher;
  }

  async changePasscode(teacherId: string, current: string | undefined, next: string): Promise<void> {
    const teacher = await this.findById(teacherId);
    if (!teacher) throw Errors.notFound('Teacher');
    if (teacher.passcodeHash && !(await this.verifyPasscode(teacher, current))) {
      throw Errors.forbidden('The current passcode is not correct.', 'INVALID_PASSCODE');
    }
    teacher.passcodeHash = await Bun.password.hash(next, 'argon2id');
    await this.teachers.save(teacher);
  }

  async assignedSections(teacherId: string): Promise<Array<{ id: string; code: string; label: string; classId: string }>> {
    const rows = await this.assignments.find({ where: { teacherId }, relations: { section: true } });
    return rows
      .map((r) => ({ id: r.section.id, code: r.section.code, label: r.section.label, classId: r.section.classId }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }
}

/** Resource-level authorization: a teacher may only touch sections assigned to them. */
@Injectable()
export class TeacherScopeService {
  constructor(@InjectRepository(TeacherSection) private readonly assignments: Repository<TeacherSection>) {}

  async sectionIds(teacherId: string): Promise<string[]> {
    const rows = await this.assignments.find({ where: { teacherId }, select: { sectionId: true } });
    return rows.map((r) => r.sectionId);
  }

  async assertSection(auth: AuthContext, sectionId: string): Promise<void> {
    const ids = await this.sectionIds(auth.userId);
    if (!ids.includes(sectionId)) {
      throw Errors.forbidden('This section is not assigned to you.', 'SECTION_NOT_ASSIGNED');
    }
  }

  /** Returns the requested section when allowed, or every assigned section when none was requested. */
  async resolveSections(auth: AuthContext, sectionId?: string): Promise<string[]> {
    const ids = await this.sectionIds(auth.userId);
    if (!sectionId) return ids;
    if (!ids.includes(sectionId)) throw Errors.forbidden('This section is not assigned to you.', 'SECTION_NOT_ASSIGNED');
    return [sectionId];
  }
}
