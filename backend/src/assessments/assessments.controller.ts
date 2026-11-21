import { Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { Auth, Roles } from '../common/decorators';
import { termSchema, uuidSchema } from '../common/schemas';
import type { AuthContext, Term } from '../common/types';
import { ZodPipe } from '../common/zod.pipe';
import {
  assessmentSaveSchema,
  finalizeAssessmentsSchema,
  type AssessmentSaveDto,
  type FinalizeAssessmentsDto,
} from '../marks/marks.schemas';
import { MarksService } from '../marks/marks.service';
import { AssessmentsService } from './assessments.service';

const sheetQuery = z.object({
  academicYearId: uuidSchema,
  sectionId: uuidSchema,
  term: termSchema,
  /** e.g. state=missing to list the students whose marks have not been entered */
  state: z.enum(['missing', 'partial', 'entered', 'finalized']).optional(),
  search: z.string().trim().max(100).optional(),
});
type SheetQuery = z.infer<typeof sheetQuery>;

const historyQuery = z.object({ enrollmentId: uuidSchema, term: termSchema });
type HistoryQuery = z.infer<typeof historyQuery>;

@Controller('assessments')
@Roles('teacher')
export class AssessmentsController {
  constructor(
    private readonly assessments: AssessmentsService,
    private readonly marks: MarksService,
  ) {}

  /** The four fixed categories and their maximums. Read-only by design. */
  @Get('categories')
  categories() {
    return this.assessments.listCategories();
  }

  @Get('sheet')
  sheet(@Auth() auth: AuthContext, @Query(new ZodPipe(sheetQuery)) q: SheetQuery) {
    return this.assessments.sheet(auth, { ...q, term: q.term as Term });
  }

  @Put('marks')
  save(@Auth() auth: AuthContext, @Body(new ZodPipe(assessmentSaveSchema)) dto: AssessmentSaveDto) {
    return this.marks.saveAssessments(auth, dto);
  }

  @Post('finalize')
  @HttpCode(200)
  finalize(@Auth() auth: AuthContext, @Body(new ZodPipe(finalizeAssessmentsSchema)) dto: FinalizeAssessmentsDto) {
    return this.marks.finalizeAssessments(auth, dto);
  }

  @Get('history')
  history(@Auth() auth: AuthContext, @Query(new ZodPipe(historyQuery)) q: HistoryQuery) {
    return this.assessments.history(auth, q.enrollmentId, q.term as Term);
  }
}
