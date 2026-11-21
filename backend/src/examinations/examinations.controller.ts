import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { Auth, Roles } from '../common/decorators';
import { hasAtMostTwoDecimals } from '../common/decimal';
import { cleanText, termSchema, uuidParam, uuidSchema } from '../common/schemas';
import type { AuthContext } from '../common/types';
import { ZodPipe } from '../common/zod.pipe';
import { examMarksSaveSchema, type ExamMarksSaveDto } from '../marks/marks.schemas';
import { MarksService } from '../marks/marks.service';
import { ExaminationsService } from './examinations.service';

const maxMarks = z
  .number('Enter the maximum marks')
  .positive('The maximum must be greater than 0')
  .max(1000, 'The maximum cannot exceed 1000')
  .refine(hasAtMostTwoDecimals, 'Use at most two decimal places');

const examDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), 'This is not a real date');

const createSchema = z
  .object({
    academicYearId: uuidSchema,
    /** one examination is created per section */
    sectionIds: z.array(uuidSchema).min(1).max(20).optional(),
    sectionId: uuidSchema.optional(),
    term: termSchema,
    name: cleanText(120),
    maxMarks,
    examDate: examDate.nullable().optional(),
  })
  .refine((v) => v.sectionIds?.length || v.sectionId, { message: 'Select at least one section', path: ['sectionIds'] })
  .transform((v) => ({
    academicYearId: v.academicYearId,
    sectionIds: [...new Set(v.sectionIds?.length ? v.sectionIds : [v.sectionId as string])],
    term: v.term,
    name: v.name,
    maxMarks: v.maxMarks,
    examDate: v.examDate ?? null,
  }));
type CreateDto = z.output<typeof createSchema>;

const updateSchema = z
  .object({ name: cleanText(120).optional(), maxMarks: maxMarks.optional(), examDate: examDate.nullable().optional() })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update');
type UpdateDto = z.infer<typeof updateSchema>;

const listQuery = z.object({ academicYearId: uuidSchema, sectionId: uuidSchema.optional(), term: termSchema.optional() });
type ListQuery = z.infer<typeof listQuery>;

const sheetQuery = z.object({
  state: z.enum(['missing', 'partial', 'entered', 'finalized']).optional(),
  search: z.string().trim().max(100).optional(),
});
type SheetQuery = z.infer<typeof sheetQuery>;

@Controller('examinations')
@Roles('teacher')
export class ExaminationsController {
  constructor(
    private readonly exams: ExaminationsService,
    private readonly marks: MarksService,
  ) {}

  @Get()
  list(@Auth() auth: AuthContext, @Query(new ZodPipe(listQuery)) q: ListQuery) {
    return this.exams.list(auth, q);
  }

  @Post()
  create(@Auth() auth: AuthContext, @Body(new ZodPipe(createSchema)) dto: CreateDto) {
    return this.exams.create(auth, dto);
  }

  @Get(':id')
  get(@Auth() auth: AuthContext, @Param('id', uuidParam) id: string) {
    return this.exams.getAccessible(auth, id);
  }

  @Patch(':id')
  update(@Auth() auth: AuthContext, @Param('id', uuidParam) id: string, @Body(new ZodPipe(updateSchema)) dto: UpdateDto) {
    return this.exams.update(auth, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Auth() auth: AuthContext, @Param('id', uuidParam) id: string) {
    return this.exams.remove(auth, id);
  }

  @Get(':id/sheet')
  sheet(@Auth() auth: AuthContext, @Param('id', uuidParam) id: string, @Query(new ZodPipe(sheetQuery)) q: SheetQuery) {
    return this.exams.sheet(auth, id, q);
  }

  @Put(':id/marks')
  save(@Auth() auth: AuthContext, @Param('id', uuidParam) id: string, @Body(new ZodPipe(examMarksSaveSchema)) dto: ExamMarksSaveDto) {
    return this.marks.saveExamMarks(auth, id, dto);
  }

  @Post(':id/finalize')
  @HttpCode(200)
  finalize(@Auth() auth: AuthContext, @Param('id', uuidParam) id: string) {
    return this.marks.finalizeExam(auth, id);
  }

  @Get(':id/history/:enrollmentId')
  history(@Auth() auth: AuthContext, @Param('id', uuidParam) id: string, @Param('enrollmentId', uuidParam) enrollmentId: string) {
    return this.exams.history(auth, id, enrollmentId);
  }
}
