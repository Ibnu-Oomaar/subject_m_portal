import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { Auth, Roles } from '../common/decorators';
import { uuidParam } from '../common/schemas';
import type { AuthContext } from '../common/types';
import { ZodPipe } from '../common/zod.pipe';
import { TeacherScopeService } from '../teachers/teachers.service';
import { AcademicYearsService } from './academic-years.service';

const createSchema = z.object({
  label: z
    .string()
    .trim()
    .regex(/^\d{4}\/\d{4}$/, 'Use the format 2026/2027')
    .refine((v) => {
      const [a, b] = v.split('/').map(Number) as [number, number];
      return b === a + 1 && a >= 2000 && a <= 2100;
    }, 'The second year must follow the first (for example 2026/2027)'),
});
type CreateDto = z.infer<typeof createSchema>;

@Controller('academic-years')
@Roles('teacher')
export class AcademicYearsController {
  constructor(
    private readonly years: AcademicYearsService,
    private readonly scope: TeacherScopeService,
  ) {}

  @Get()
  async list(@Auth() auth: AuthContext) {
    return this.years.list(await this.scope.sectionIds(auth.userId));
  }

  @Post()
  async create(@Auth() auth: AuthContext, @Body(new ZodPipe(createSchema)) dto: CreateDto) {
    const year = await this.years.create(auth, dto.label);
    return { id: year.id, label: year.label, startYear: year.startYear, status: year.status, createdAt: year.createdAt.toISOString(), studentCount: 0 };
  }

  @Post(':id/activate')
  @HttpCode(200)
  async activate(@Auth() auth: AuthContext, @Param('id', uuidParam) id: string) {
    const y = await this.years.activate(auth, id);
    return { id: y.id, label: y.label, status: y.status };
  }

  @Post(':id/close')
  @HttpCode(200)
  async close(@Auth() auth: AuthContext, @Param('id', uuidParam) id: string) {
    const y = await this.years.close(auth, id);
    return { id: y.id, label: y.label, status: y.status };
  }

  @Get(':id/summary')
  async summary(@Auth() auth: AuthContext, @Param('id', uuidParam) id: string) {
    return this.years.summary(id, await this.scope.sectionIds(auth.userId));
  }
}
