import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError, api, errorMessage, setCsrfToken, setUnauthenticatedHandler, withQuery } from './api';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  setCsrfToken('');
  setUnauthenticatedHandler(null);
});
afterEach(() => vi.unstubAllGlobals());

describe('withQuery', () => {
  test('skips empty values and encodes the rest', () => {
    expect(withQuery('/students')).toBe('/api/students');
    expect(withQuery('/students', { a: '1', b: undefined, c: null, d: '', e: 0, f: 'x y' })).toBe('/api/students?a=1&e=0&f=x+y');
    expect(withQuery('/x', { a: undefined })).toBe('/api/x');
  });
});

describe('requests', () => {
  test('GET carries no CSRF token; unsafe methods carry the current one, as JSON, with the session cookie', async () => {
    fetchMock.mockImplementation(async () => json(200, { ok: true }));
    await api.get('/classes');
    expect(fetchMock.mock.calls[0]![1].headers['X-CSRF-Token']).toBeUndefined();

    setCsrfToken('tok123');
    await api.post('/examinations', { name: 'T1' });
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe('/api/examinations');
    expect(init.method).toBe('POST');
    expect(init.headers['X-CSRF-Token']).toBe('tok123');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.credentials).toBe('same-origin');
    expect(init.body).toBe('{"name":"T1"}');
  });
  test('uploads send the form untouched so the browser sets the multipart boundary', async () => {
    fetchMock.mockImplementation(async () => json(200, {}));
    const form = new FormData();
    form.append('x', '1');
    await api.upload('/imports/students/preview', form);
    const init = fetchMock.mock.calls[0]![1];
    expect(init.body).toBe(form);
    expect(init.headers['Content-Type']).toBeUndefined();
  });
  test('204 resolves to undefined', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await api.post('/auth/logout')).toBeUndefined();
  });
});

describe('errors', () => {
  test('backend error bodies become ApiError with status, code, message and details', async () => {
    fetchMock.mockImplementation(async () => json(409, { error: { code: 'CONCURRENT_MODIFICATION', message: 'Changed by someone else.', details: { x: 1 } } }));
    const err = (await api.put('/assessments/marks', {}).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'CONCURRENT_MODIFICATION', message: 'Changed by someone else.', details: { x: 1 } });
    expect(err.fieldErrors).toEqual([]);
  });
  test('validation errors expose per-field messages', async () => {
    const details = [{ path: 'entries.0.textbook', message: 'Maximum is 5' }];
    fetchMock.mockImplementation(async () => json(400, { error: { code: 'VALIDATION_ERROR', message: 'Invalid.', details } }));
    const err = (await api.put('/assessments/marks', {}).catch((e) => e)) as ApiError;
    expect(err.fieldErrors).toEqual(details);
  });
  test('a non-JSON failure (for example a proxy page) still gives a readable error', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
    const err = (await api.get('/x').catch((e) => e)) as ApiError;
    expect(err).toMatchObject({ status: 502, code: 'HTTP_ERROR' });
    expect(err.message).toContain('502');
  });
  test('413 is reported as PAYLOAD_TOO_LARGE', async () => {
    fetchMock.mockResolvedValue(new Response('too big', { status: 413 }));
    expect(((await api.upload('/x', new FormData()).catch((e) => e)) as ApiError).code).toBe('PAYLOAD_TOO_LARGE');
  });
  test('a network failure is an ApiError with status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const err = (await api.get('/x').catch((e) => e)) as ApiError;
    expect(err).toMatchObject({ status: 0, code: 'NETWORK' });
    expect(errorMessage(err)).toMatch(/Cannot reach the server/);
  });
});

describe('session expiry', () => {
  test('an UNAUTHENTICATED 401 notifies the app, but a failed login attempt does not', async () => {
    const handler = vi.fn();
    setUnauthenticatedHandler(handler);
    fetchMock.mockImplementation(async () => json(401, { error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } }));
    await api.get('/students').catch(() => undefined);
    expect(handler).toHaveBeenCalledTimes(1);

    await api.post('/auth/teacher/login', { name: 'x' }, { auth: false }).catch(() => undefined);
    expect(handler).toHaveBeenCalledTimes(1);
  });
  test('other 401 codes (for example invalid credentials) do not log the person out', async () => {
    const handler = vi.fn();
    setUnauthenticatedHandler(handler);
    fetchMock.mockImplementation(async () => json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'No.' } }));
    await api.get('/x').catch(() => undefined);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('errorMessage', () => {
  test('uses the message of known errors and a safe default otherwise', () => {
    expect(errorMessage(new ApiError(400, { code: 'X', message: 'Specific.' }))).toBe('Specific.');
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('weird')).toMatch(/Something went wrong/);
  });
});
