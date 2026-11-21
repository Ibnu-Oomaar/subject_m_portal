import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { TeachersService } from '../src/teachers/teachers.service';

export interface Res<T = any> {
  status: number;
  body: T;
  headers: Headers;
  raw: Buffer;
}

/** A tiny cookie-aware HTTP client that also carries the CSRF token like the real frontend does. */
export class Client {
  cookie = '';
  csrf = '';
  constructor(private readonly base: string) {}

  async request<T = any>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<Res<T>> {
    const headers: Record<string, string> = { ...extraHeaders };
    if (body !== undefined && !(body instanceof FormData)) headers['content-type'] = 'application/json';
    if (this.cookie) headers.cookie = this.cookie;
    if (this.csrf && method !== 'GET') headers['x-csrf-token'] = this.csrf;
    const res = await fetch(`${this.base}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie();
    if (set.length) {
      const pair = set[0]!.split(';')[0]!;
      this.cookie = pair.endsWith('=') ? '' : pair;
    }
    const raw = Buffer.from(await res.arrayBuffer());
    let parsed: unknown = null;
    const type = res.headers.get('content-type') ?? '';
    if (type.includes('json')) {
      try {
        parsed = JSON.parse(raw.toString('utf8'));
      } catch {
        parsed = null;
      }
    }
    return { status: res.status, body: parsed as T, headers: res.headers, raw };
  }
  get = <T = any>(path: string) => this.request<T>('GET', path);
  post = <T = any>(path: string, body?: unknown) => this.request<T>('POST', path, body ?? {});
  put = <T = any>(path: string, body?: unknown) => this.request<T>('PUT', path, body ?? {});
  patch = <T = any>(path: string, body?: unknown) => this.request<T>('PATCH', path, body ?? {});
  del = <T = any>(path: string) => this.request<T>('DELETE', path);

  async loginTeacher(name: string, passcode?: string) {
    const r = await this.post('/auth/teacher/login', { name, passcode });
    if (r.status === 200) this.csrf = r.body.csrfToken;
    return r;
  }
  async loginStudent(studentId: string) {
    const r = await this.post('/auth/student/login', { studentId });
    if (r.status === 200) this.csrf = r.body.csrfToken;
    return r;
  }
}

export interface TestApp {
  app: INestApplication;
  url: string;
  ds: DataSource;
  teachers: TeachersService;
  client: () => Client;
  close: () => Promise<void>;
}

export async function startApp(): Promise<TestApp> {
  if (process.env.NODE_ENV !== 'test') throw new Error('Integration tests must run with NODE_ENV=test');
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: ['error'] });
  configureApp(app);
  await app.listen(0);
  const port = (app.getHttpServer().address() as { port: number }).port;
  const ds = app.get(DataSource);
  // Refuse to wipe anything that is not the dedicated test database.
  const [{ db }] = (await ds.query('select current_database() as db')) as Array<{ db: string }>;
  if (!db.endsWith('_test')) throw new Error(`Refusing to reset non-test database "${db}"`);
  await ds.query(
    `TRUNCATE app_state, audit_logs, exam_marks, examinations, assessments, enrollments, students, academic_years, teacher_sections, teachers RESTART IDENTITY CASCADE`,
  );
  return {
    app,
    url: `http://localhost:${port}`,
    ds,
    teachers: app.get(TeachersService),
    client: () => new Client(`http://localhost:${port}`),
    close: () => app.close(),
  };
}
