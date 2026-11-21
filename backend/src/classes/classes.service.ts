import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Section } from '../sections/section.entity';
import { SchoolClass } from './class.entity';

export interface ClassView {
  id: string;
  gradeLevel: number;
  name: string;
  sections: Array<{ id: string; code: string; label: string; classId: string }>;
}

@Injectable()
export class ClassesService {
  constructor(
    @InjectRepository(SchoolClass) private readonly classes: Repository<SchoolClass>,
    @InjectRepository(Section) private readonly sections: Repository<Section>,
  ) {}

  /** Classes with their sections, limited to the sections the caller is allowed to see. */
  async listWithSections(allowedSectionIds: string[]): Promise<ClassView[]> {
    const [classes, sections] = await Promise.all([
      this.classes.find({ order: { gradeLevel: 'ASC' } }),
      this.sections.find({ order: { label: 'ASC' } }),
    ]);
    const allowed = new Set(allowedSectionIds);
    return classes
      .map((c) => ({
        id: c.id,
        gradeLevel: c.gradeLevel,
        name: c.name,
        sections: sections
          .filter((s) => s.classId === c.id && allowed.has(s.id))
          .map((s) => ({ id: s.id, code: s.code, label: s.label, classId: s.classId })),
      }))
      .filter((c) => c.sections.length > 0);
  }
}
