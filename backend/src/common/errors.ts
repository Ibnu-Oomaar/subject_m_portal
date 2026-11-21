import { HttpException } from '@nestjs/common';

/** Every API error is rendered as `{ error: { code, message, details? } }` by AllExceptionsFilter. */
export class AppError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

export const Errors = {
  badRequest: (message: string, details?: unknown, code = 'BAD_REQUEST') => new AppError(400, code, message, details),
  validation: (details: unknown, message = 'The request contains invalid data.') =>
    new AppError(400, 'VALIDATION_ERROR', message, details),
  unauthenticated: () => new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.'),
  invalidCredentials: () => new AppError(401, 'INVALID_CREDENTIALS', 'The details you entered are not valid.'),
  passcodeRequired: () => new AppError(401, 'PASSCODE_REQUIRED', 'This account is protected by a passcode. Please enter it.'),
  forbidden: (message = 'You do not have access to this resource.', code = 'FORBIDDEN') =>
    new AppError(403, code, message),
  csrf: () => new AppError(403, 'CSRF_INVALID', 'The request could not be verified. Please reload the page.'),
  notFound: (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} was not found.`),
  conflict: (message: string, details?: unknown, code = 'CONFLICT') => new AppError(409, code, message, details),
  duplicate: (message: string, details?: unknown) => new AppError(409, 'DUPLICATE', message, details),
  constraint: (message: string, details?: unknown) => new AppError(422, 'CONSTRAINT_VIOLATION', message, details),
  tooLarge: (message: string) => new AppError(413, 'PAYLOAD_TOO_LARGE', message),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError(429, 'RATE_LIMITED', 'Too many attempts. Please wait before trying again.', { retryAfterSeconds }),
};
