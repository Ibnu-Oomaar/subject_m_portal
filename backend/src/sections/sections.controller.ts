import { Controller, Get } from '@nestjs/common';
import { Auth, Roles } from '../common/decorators';
import type { AuthContext } from '../common/types';
import { TeacherScopeService } from '../teachers/teachers.service';
import { SectionsService } from './sections.service';

@Controller('sections')
@Roles('teacher')
export class SectionsController {
  constructor(
    private readonly sections: SectionsService,
    private readonly scope: TeacherScopeService,
  ) {}

  /** The sections assigned to the signed-in teacher. */
  @Get()
  async list(@Auth() auth: AuthContext) {
    return this.sections.findByIds(await this.scope.sectionIds(auth.userId));
  }
}
