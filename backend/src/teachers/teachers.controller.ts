import { Body, Controller, Get, HttpCode, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Auth, Roles } from '../common/decorators';
import { Errors } from '../common/errors';
import type { AuthContext } from '../common/types';
import { ZodPipe } from '../common/zod.pipe';
import { SessionService } from '../security/session.service';
import { TeachersService } from './teachers.service';

const passcodeSchema = z.object({
  currentPasscode: z.string().max(128).optional(),
  newPasscode: z.string().min(8, 'Use at least 8 characters').max(128),
});
type PasscodeDto = z.infer<typeof passcodeSchema>;

@Controller('teachers')
@Roles('teacher')
export class TeachersController {
  constructor(
    private readonly teachers: TeachersService,
    private readonly sessions: SessionService,
  ) {}

  @Get('me')
  async me(@Auth() auth: AuthContext) {
    const teacher = await this.teachers.findById(auth.userId);
    if (!teacher) throw Errors.notFound('Teacher');
    return {
      id: teacher.id,
      name: teacher.name,
      hasPasscode: teacher.passcodeHash !== null,
      sections: await this.teachers.assignedSections(teacher.id),
    };
  }

  /** Sets or changes the optional access passcode. All other sessions of this teacher are signed out. */
  @Put('me/passcode')
  @HttpCode(204)
  async setPasscode(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(passcodeSchema)) dto: PasscodeDto,
    @Req() _req: Request,
  ): Promise<void> {
    await this.teachers.changePasscode(auth.userId, dto.currentPasscode, dto.newPasscode);
    await this.sessions.destroyAllForUser('teacher', auth.userId, auth.sessionId);
  }
}
