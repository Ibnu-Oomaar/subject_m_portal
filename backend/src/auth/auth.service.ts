import { Injectable } from '@nestjs/common';
import { Errors } from '../common/errors';
import type { Role } from '../common/types';
import { LoginThrottleService } from '../security/login-throttle.service';
import { SessionService } from '../security/session.service';
import { isValidStudentId, normalizeStudentId, StudentsService } from '../students/students.service';
import { normalizeTeacherName, TeachersService } from '../teachers/teachers.service';

export type AuthSession =
  | { role: 'teacher'; user: { id: string; name: string }; csrfToken: string }
  | { role: 'student'; user: { id: string; studentId: string; fullName: string }; csrfToken: string };

/**
 * Teachers sign in with their registered name (plus an optional passcode if one has been set); students sign in
 * with their Student ID only. Neither a name nor an ID is ever enough on its own to call the API: a successful login
 * creates a server-side session, and every request is authorized from that session.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly teachers: TeachersService,
    private readonly students: StudentsService,
    private readonly sessions: SessionService,
    private readonly throttle: LoginThrottleService,
  ) {}

  async teacherLogin(name: string, passcode: string | undefined, ip: string, previousSid?: string) {
    const identifier = `teacher:${normalizeTeacherName(name)}`;
    await this.throttle.assertAllowed(ip, identifier);

    const teacher = await this.teachers.findByName(name);
    if (!teacher || !teacher.isActive) {
      await this.throttle.recordFailure(ip, identifier);
      throw Errors.invalidCredentials();
    }
    if (teacher.passcodeHash && !passcode) {
      // The name is right but a passcode is needed: let the form ask for it (not counted as a failed guess).
      throw Errors.passcodeRequired();
    }
    if (!(await this.teachers.verifyPasscode(teacher, passcode))) {
      await this.throttle.recordFailure(ip, identifier);
      throw Errors.invalidCredentials();
    }
    await this.throttle.recordSuccess(identifier);
    return this.start('teacher', teacher.id, previousSid, {
      role: 'teacher' as const,
      user: { id: teacher.id, name: teacher.name },
    });
  }

  async studentLogin(rawStudentId: string, ip: string, previousSid?: string) {
    const studentId = normalizeStudentId(rawStudentId);
    const identifier = `student:${studentId}`;
    await this.throttle.assertAllowed(ip, identifier);

    const student = isValidStudentId(studentId) ? await this.students.findByStudentId(studentId) : null;
    if (!student) {
      await this.throttle.recordFailure(ip, identifier);
      throw Errors.invalidCredentials();
    }
    await this.throttle.recordSuccess(identifier);
    return this.start('student', student.id, previousSid, {
      role: 'student' as const,
      user: { id: student.id, studentId: student.studentId, fullName: student.fullName },
    });
  }

  /** Rebuilds the session payload for GET /auth/me; null when the account no longer exists / is inactive. */
  async describe(role: Role, userId: string, csrfToken: string): Promise<AuthSession | null> {
    if (role === 'teacher') {
      const t = await this.teachers.findById(userId);
      return t?.isActive ? { role, user: { id: t.id, name: t.name }, csrfToken } : null;
    }
    const s = await this.students.findById(userId);
    return s ? { role, user: { id: s.id, studentId: s.studentId, fullName: s.fullName }, csrfToken } : null;
  }

  logout(sid: string) {
    return this.sessions.destroy(sid);
  }

  private async start<T extends { role: Role }>(role: Role, userId: string, previousSid: string | undefined, body: T) {
    if (previousSid) await this.sessions.destroy(previousSid); // never reuse a session id across logins
    const { sid, csrfToken } = await this.sessions.create(role, userId);
    return { sid, session: { ...body, csrfToken } as unknown as AuthSession };
  }
}
