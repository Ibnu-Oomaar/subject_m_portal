export type Role = 'teacher' | 'student';

export interface AuthContext {
  role: Role;
  /** teachers.id for teachers, students.id for students. */
  userId: string;
  csrfToken: string;
  sessionId: string;
  ip: string;
}

export type Term = 1 | 2 | 3;
export const TERMS: readonly Term[] = [1, 2, 3];
export const TERM_LABELS: Record<Term, string> = { 1: 'Term 1', 2: 'Term 2', 3: 'Final Term 3' };

/** missing = no marks · partial = some assessment categories entered · entered = complete · finalized = locked */
export type ResultState = 'missing' | 'partial' | 'entered' | 'finalized';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}
