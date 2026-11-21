import { Controller, Get, Header, Param, Query, StreamableFile } from '@nestjs/common';
import { z } from 'zod';
import { Auth, Roles } from '../common/decorators';
import { uuidSchema, termSchema } from '../common/schemas';
import type { AuthContext } from '../common/types';
import { ZodPipe } from '../common/zod.pipe';
import { XLSX_MIME } from '../excel/excel.service';
import { EXPORT_TYPES, ReportsService, type ExportType } from './reports.service';

const typeParam = new ZodPipe(z.enum(EXPORT_TYPES));
const exportQuery = z.object({
  academicYearId: uuidSchema.optional(),
  sectionId: uuidSchema.optional(),
  scope: z.enum(['section', 'class']).optional(),
  term: termSchema.optional(),
  examId: uuidSchema.optional(),
  enrollmentId: uuidSchema.optional(),
  kind: z.enum(['index', 'assessment', 'exam']).optional(),
});
type ExportQueryDto = z.infer<typeof exportQuery>;

/** Excel downloads. The same endpoint serves every report type; what is exported is always limited to the teacher's sections. */
@Controller('exports')
@Roles('teacher')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get(':type')
  @Header('Cache-Control', 'no-store')
  async download(@Auth() auth: AuthContext, @Param('type', typeParam) type: ExportType, @Query(new ZodPipe(exportQuery)) query: ExportQueryDto): Promise<StreamableFile> {
    const file = await this.reports.export(auth, type, { ...query, term: query.term as 1 | 2 | 3 | undefined });
    return new StreamableFile(file.buffer, { type: XLSX_MIME, disposition: `attachment; filename="${file.fileName}"`, length: file.buffer.length });
  }
}
