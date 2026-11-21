import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { io, type Socket } from 'socket.io-client';
import { EventsGateway } from '../src/events/events.gateway';
import { Client, startApp, type TestApp } from './helpers';

let t: TestApp;
let teacher: Client;
let other: Client; // only 1C
const S: Record<string, string> = {};
const E: Record<string, string> = {};
let year1 = '';
const open: Socket[] = [];

const connect = (c: Client, headers: Record<string, string> = {}) => {
  const socket = io(t.url, { path: '/api/socket.io', transports: ['websocket'], reconnection: false, extraHeaders: { cookie: c.cookie, origin: 'http://localhost:5173', ...headers } });
  open.push(socket);
  return socket;
};
const next = <T = any>(socket: Socket, event: string, ms = 2000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
const ready = async (socket: Socket) => {
  await next(socket, 'ready');
  return socket;
};
const rejected = (socket: Socket) => new Promise<string>((resolve) => socket.once('connect_error', (e) => resolve(e.message)));
const silent = (socket: Socket, event: string, ms = 400) =>
  new Promise<boolean>((resolve) => {
    let got = false;
    socket.once(event, () => (got = true));
    setTimeout(() => resolve(!got), ms);
  });
const saveB = (version = 0) =>
  teacher.put('/assessments/marks', { academicYearId: year1, sectionId: S.B, term: 1, entries: [{ enrollmentId: E.amina, version, classActivities: 5 }] });

beforeAll(async () => {
  t = await startApp();
  await t.teachers.create({ name: 'Ms Test' });
  await t.teachers.create({ name: 'Mr Other', sectionLabels: ['1C'] });
  teacher = t.client();
  other = t.client();
  expect((await teacher.loginTeacher('Ms Test')).status).toBe(200);
  expect((await other.loginTeacher('Mr Other')).status).toBe(200);
  for (const sec of (await teacher.get('/classes')).body[0].sections) S[sec.code] = sec.id;
  year1 = (await teacher.post('/academic-years', { label: '2026/2027' })).body.id;
  const a = await teacher.post('/students', { academicYearId: year1, sectionId: S.B, studentId: 'T-1001', fullName: 'Amina Ali' });
  E.amina = a.body.enrollmentId;
  const c = await teacher.post('/students', { academicYearId: year1, sectionId: S.C, studentId: 'T-2001', fullName: 'Carl Kamau' });
  E.carl = c.body.enrollmentId;
});

// Each test starts with no open connections, so the per-teacher connection cap is only exercised on purpose.
afterEach(async () => {
  for (const s of open.splice(0)) s.close();
  await new Promise((r) => setTimeout(r, 150)); // let the server notice the disconnects
});

afterAll(async () => {
  await t.close();
});

describe('Socket.IO: authentication', () => {
  test('connections without a session, with a bad session, from a student, or from a foreign origin are refused', async () => {
    expect(await rejected(connect(t.client()))).toBe('UNAUTHENTICATED');
    const forged = t.client();
    forged.cookie = 'mp_sid=' + 'A'.repeat(43);
    expect(await rejected(connect(forged))).toBe('UNAUTHENTICATED');
    expect(await rejected(connect(teacher, { origin: 'https://evil.example' }))).toBe('FORBIDDEN_ORIGIN');

    const student = t.client();
    expect((await student.loginStudent('T-1001')).status).toBe(200);
    expect(await rejected(connect(student))).toBe('FORBIDDEN');
  });

  test('a teacher with a valid session connects and is told how many sections they follow', async () => {
    const socket = connect(teacher);
    const hello = await next(socket, 'ready');
    expect(hello.sections).toBe(7);
    const mine = connect(other);
    expect((await next(mine, 'ready')).sections).toBe(1);
  });
});

describe('Socket.IO: change notices', () => {
  test('a save in a section notifies that section\'s teachers, and only with non-sensitive facts', async () => {
    const socket = await ready(connect(teacher));
    const event = next(socket, 'marks.changed');
    expect((await saveB()).status).toBe(200);
    const payload = await event;
    expect(payload).toMatchObject({ type: 'marks.changed', academicYearId: year1, sectionId: S.B, kind: 'assessment', term: 1 });
    // no student names, ids or marks are ever sent over the socket
    const wire = JSON.stringify(payload);
    expect(wire).not.toContain('Amina');
    expect(wire).not.toContain('T-1001');
    expect(wire).not.toContain(E.amina!);
    expect(Object.keys(payload).sort()).toEqual(['academicYearId', 'at', 'kind', 'sectionId', 'term', 'type']);
  });

  test('a teacher who is not assigned to the section receives nothing about it, even if they try to join its room', async () => {
    const mine = await ready(connect(other));
    const quiet = silent(mine, 'marks.changed');
    mine.emit('join', { room: `section:${S.B}` });
    mine.emit('subscribe', S.B);
    const version = (await teacher.get(`/assessments/sheet?academicYearId=${year1}&sectionId=${S.B}&term=1`)).body.rows[0].version;
    expect((await saveB(version)).status).toBe(200);
    expect(await quiet).toBe(true);

    // but changes in their own section do reach them
    const own = next(mine, 'marks.changed');
    expect((await teacher.put('/assessments/marks', { academicYearId: year1, sectionId: S.C, term: 1, entries: [{ enrollmentId: E.carl, version: 0, textbook: 2 }] })).status).toBe(200);
    expect((await own).sectionId).toBe(S.C);
  });

  test('examination changes are announced with the examination id', async () => {
    const socket = await ready(connect(teacher));
    const created = await teacher.post('/examinations', { academicYearId: year1, sectionId: S.B, term: 2, name: 'Mid term', maxMarks: 60 });
    expect(created.status).toBe(201);
    const examId = created.body[0].id;
    const event = next(socket, 'marks.changed');
    expect((await teacher.put(`/examinations/${examId}/marks`, { entries: [{ enrollmentId: E.amina, version: 0, marks: 41 }] })).status).toBe(200);
    expect(await event).toMatchObject({ kind: 'exam', term: 2, examId, sectionId: S.B });
  });
});

describe('Socket.IO: session lifetime', () => {
  test('a connection ends when its session ends (logout), and keeps working while the session lives', async () => {
    const c = t.client();
    expect((await c.loginTeacher('Ms Test')).status).toBe(200);
    const socket = await ready(connect(c));
    const gateway = t.app.get(EventsGateway);

    await gateway.recheckSessions();
    expect(socket.connected).toBe(true); // session still valid

    const expired = next(socket, 'session.expired');
    const closed = next(socket, 'disconnect');
    expect((await c.post('/auth/logout')).status).toBe(204);
    await gateway.recheckSessions();
    await expired;
    expect(await closed).toBe('io server disconnect');
    expect(socket.connected).toBe(false);
  });

  test('re-checking a session does not extend it', async () => {
    const c = t.client();
    await c.loginTeacher('Ms Test');
    const sid = c.cookie.split('=')[1]!;
    const { createHash } = await import('node:crypto');
    const key = `sess:${createHash('sha256').update(sid).digest('hex')}`;
    const redis = (await import('../src/redis/redis.service')).RedisService;
    const client = t.app.get(redis).client;
    await client.expire(key, 100);
    const socket = await ready(connect(c)); // connecting is real activity: it may extend the session
    await client.expire(key, 100); // reset to a known value
    await t.app.get(EventsGateway).recheckSessions();
    expect(await client.ttl(key)).toBeLessThanOrEqual(100); // the background check left the timer alone
    socket.close();
  });

  test('a teacher cannot hold unlimited connections', async () => {
    const c = t.client();
    await c.loginTeacher('Ms Test');
    const sockets: Socket[] = [];
    for (let i = 0; i < 10; i++) sockets.push(await ready(connect(c)));
    expect(await rejected(connect(c))).toBe('TOO_MANY_CONNECTIONS');
    sockets.forEach((s) => s.close());
  });
});
