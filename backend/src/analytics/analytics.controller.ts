import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { Auth, Roles } from '../common/decorators';
import { uuidSchema } from '../common/schemas';
import type { AuthContext } from '../common/types';
import { ZodPipe } from '../common/zod.pipe';
import { AnalyticsService } from './analytics.service';

const dashboardQuery = z.object({ academicYearId: uuidSchema.optional() });
type DashboardQuery = z.infer<typeof dashboardQuery>;
const sectionQuery = z.object({ academicYearId: uuidSchema, sectionId: uuidSchema });
type SectionQuery = z.infer<typeof sectionQuery>;

@Controller('analytics')
@Roles('teacher')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  dashboard(@Auth() auth: AuthContext, @Query(new ZodPipe(dashboardQuery)) q: DashboardQuery) {
    return this.analytics.dashboard(auth, q.academicYearId);
  }

  @Get('section')
  section(@Auth() auth: AuthContext, @Query(new ZodPipe(sectionQuery)) q: SectionQuery) {
    return this.analytics.section(auth, q.academicYearId, q.sectionId);
  }
}
