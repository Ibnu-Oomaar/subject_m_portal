import { Controller, Get, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { Auth, Roles } from '../common/decorators';
import { uuidParam, uuidSchema } from '../common/schemas';
import type { AuthContext } from '../common/types';
import { ZodPipe } from '../common/zod.pipe';
import { ResultsService } from './results.service';

/** Teacher view: one student's complete academic profile. */
@Controller('students')
@Roles('teacher')
export class StudentProfileController {
  constructor(private readonly results: ResultsService) {}

  @Get(':enrollmentId/profile')
  profile(@Auth() auth: AuthContext, @Param('enrollmentId', uuidParam) enrollmentId: string) {
    return this.results.teacherProfile(auth, enrollmentId);
  }
}

const meQuery = z.object({ academicYearId: uuidSchema.optional() });
type MeQuery = z.infer<typeof meQuery>;

/**
 * Student self-service. Nothing here accepts a student id: the student is ALWAYS the one in the server-side
 * session, so one student can never request another student's data. (The student role is also rejected by the
 * guard on every teacher route.)
 */
@Controller('me')
@Roles('student')
export class MeController {
  constructor(private readonly results: ResultsService) {}

  @Get('years')
  years(@Auth() auth: AuthContext) {
    return this.results.studentYears(auth.userId);
  }

  @Get('profile')
  async profile(@Auth() auth: AuthContext, @Query(new ZodPipe(meQuery)) q: MeQuery) {
    const profile = await this.results.studentProfile(auth.userId, q.academicYearId);
    return profile ?? { student: null, message: 'You are not enrolled in any academic year yet.' };
  }
}
