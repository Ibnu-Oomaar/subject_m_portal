import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Errors } from '../common/errors';
import { Section } from './section.entity';

export interface SectionView {
  id: string;
  code: string;
  label: string;
  classId: string;
}

@Injectable()
export class SectionsService {
  constructor(@InjectRepository(Section) private readonly sections: Repository<Section>) {}

  private view(s: Section): SectionView {
    return { id: s.id, code: s.code, label: s.label, classId: s.classId };
  }

  async findByIds(ids: string[]): Promise<SectionView[]> {
    if (!ids.length) return [];
    const rows = await this.sections.find({ where: { id: In(ids) }, order: { label: 'ASC' } });
    return rows.map((s) => this.view(s));
  }

  async getOrFail(id: string): Promise<SectionView> {
    const s = await this.sections.findOneBy({ id });
    if (!s) throw Errors.notFound('Section');
    return this.view(s);
  }

  /** Resolves "Class 1" + "B" style input to a section, or null when no such section exists. */
  async findByGradeAndCode(gradeLevel: number, code: string): Promise<SectionView | null> {
    const s = await this.sections
      .createQueryBuilder('s')
      .innerJoin('s.schoolClass', 'c')
      .where('c.gradeLevel = :gradeLevel AND s.code = :code', { gradeLevel, code: code.toUpperCase() })
      .getOne();
    return s ? this.view(s) : null;
  }
}
