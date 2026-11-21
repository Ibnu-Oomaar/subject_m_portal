import { Controller, Get } from '@nestjs/common';
import { Auth, Roles } from '../common/decorators';
import type { AuthContext } from '../common/types';
import { TeacherScopeService } from '../teachers/teachers.service';
import { ClassesService } from './classes.service';

@Controller('classes')
@Roles('teacher')
export class ClassesController {
  constructor(
    private readonly classes: ClassesService,
    private readonly scope: TeacherScopeService,
  ) {}

  @Get()
  async list(@Auth() auth: AuthContext) {
    return this.classes.listWithSections(await this.scope.sectionIds(auth.userId));
  }
}
