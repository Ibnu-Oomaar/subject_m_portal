import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { Auth, Roles } from '../common/decorators';
import { termSchema, uuidSchema } from '../common/schemas';
import type { AuthContext, Term } from '../common/types';
import { ZodPipe } from '../common/zod.pipe';
import { RankingsService } from './rankings.service';

const rankingQuery = z
  .object({
    academicYearId: uuidSchema,
    sectionId: uuidSchema,
    scope: z.enum(['section', 'class']).default('section'),
    kind: z.enum(['index', 'assessment', 'exam']).default('index'),
    term: termSchema.optional(),
    examId: uuidSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'assessment' && v.term === undefined) ctx.addIssue({ code: 'custom', path: ['term'], message: 'Choose a term' });
    if (v.kind === 'exam' && !v.examId) ctx.addIssue({ code: 'custom', path: ['examId'], message: 'Choose an examination' });
  });
type RankingQueryDto = z.infer<typeof rankingQuery>;

@Controller('rankings')
@Roles('teacher')
export class RankingsController {
  constructor(private readonly rankings: RankingsService) {}

  @Get()
  rank(@Auth() auth: AuthContext, @Query(new ZodPipe(rankingQuery)) q: RankingQueryDto) {
    return this.rankings.rank(auth, { ...q, term: q.term as Term | undefined });
  }
}
