import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { ZodError } from 'zod';
import { AppError } from './errors';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'CONSTRAINT_VIOLATION',
  429: 'RATE_LIMITED',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    const { status, body } = this.map(exception, res);

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    if (status === 429) {
      const retry = (body.error.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
      if (retry) res.setHeader('Retry-After', String(retry));
    }
    res.status(status).json(body);
  }

  private map(e: unknown, res: Response): { status: number; body: ErrorBody } {
    if (e instanceof AppError) {
      return { status: e.getStatus(), body: { error: { code: e.code, message: e.message, details: e.details } } };
    }
    if (e instanceof ThrottlerException) {
      const retry = Number(res.getHeader('Retry-After')) || 60;
      return {
        status: 429,
        body: {
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please slow down.',
            details: { retryAfterSeconds: retry },
          },
        },
      };
    }
    if (e instanceof ZodError) {
      return {
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'The request contains invalid data.',
            details: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          },
        },
      };
    }
    if (e instanceof QueryFailedError) {
      return this.mapDatabaseError(e);
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const response = e.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : ((response as { message?: string | string[] }).message ?? e.message);
      return {
        status,
        body: {
          error: {
            code: STATUS_CODES[status] ?? 'ERROR',
            message: Array.isArray(message) ? message.join('; ') : message,
          },
        },
      };
    }
    // Express/body-parser style errors (malformed JSON, payload too large, ...)
    const anyErr = e as { status?: number; statusCode?: number; type?: string } | null;
    const status = anyErr?.status ?? anyErr?.statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      const message =
        anyErr?.type === 'entity.too.large'
          ? 'The request body is too large.'
          : anyErr?.type === 'entity.parse.failed'
            ? 'The request body is not valid JSON.'
            : 'The request could not be processed.';
      return { status, body: { error: { code: STATUS_CODES[status] ?? 'BAD_REQUEST', message } } };
    }
    return {
      status: 500,
      body: { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server.' } },
    };
  }

  private mapDatabaseError(e: QueryFailedError): { status: number; body: ErrorBody } {
    const code = (e.driverError as { code?: string } | undefined)?.code;
    switch (code) {
      case '23505':
        return this.db(409, 'DUPLICATE', 'A record with the same unique values already exists.');
      case '23503':
        return this.db(422, 'CONSTRAINT_VIOLATION', 'The record is linked to other data or refers to missing data.');
      case '23514':
        return this.db(422, 'CONSTRAINT_VIOLATION', 'The data violates an integrity rule.');
      case '23502':
        return this.db(400, 'VALIDATION_ERROR', 'A required value is missing.');
      case '40001':
      case '40P01':
        return this.db(409, 'CONFLICT', 'The data was changed at the same time. Please reload and try again.');
      default:
        return this.db(500, 'INTERNAL_ERROR', 'Something went wrong on the server.');
    }
  }

  private db(status: number, code: string, message: string) {
    return { status, body: { error: { code, message } } as ErrorBody };
  }
}
