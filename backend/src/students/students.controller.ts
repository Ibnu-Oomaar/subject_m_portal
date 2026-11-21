import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Auth, Roles } from '../common/decorators';
import { cleanText, paginationSchema, uuidParam, uuidSchema } from '../common/schemas';
import type { AuthContext } from '../common/types';
import { ZodPipe } from '../common/zod.pipe';
import { StudentsService } from './students.service';

const listSchema = paginationSchema.extend({
  academicYearId: uuidSchema,
  sectionId: uuidSchema.optional(),
  search: z.string().trim().max(100).optional(),
});
type ListQuery = z.infer<typeof listSchema>;

const enrollSchema = z.object({
  academicYearId: uuidSchema,
  sectionId: uuidSchema,
  studentId: z.string().trim().min(1, 'Student ID is required').max(40),
  fullName: cleanText(150),
});
type EnrollDto = z.infer<typeof enrollSchema>;

const renameSchema = z.object({ fullName: cleanText(150) });
type RenameDto = z.infer<typeof renameSchema>;

@Controller('students')
@Roles('teacher')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  list(@Auth() auth: AuthContext, @Query(new ZodPipe(listSchema)) q: ListQuery) {
    return this.students.list(auth, q);
  }

  @Post()
  enroll(@Auth() auth: AuthContext, @Body(new ZodPipe(enrollSchema)) dto: EnrollDto) {
    return this.students.enroll(auth, dto);
  }

  @Patch(':enrollmentId')
  rename(
    @Auth() auth: AuthContext,
    @Param('enrollmentId', uuidParam) enrollmentId: string,
    @Body(new ZodPipe(renameSchema)) dto: RenameDto,
  ) {
    return this.students.rename(auth, enrollmentId, dto.fullName);
  }
}
