import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider, useAuth } from './AuthProvider';

const session = { role: 'teacher', user: { id: 't1', name: 'Ms Test' }, csrfToken: 'csrf-1' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let auth: ReturnType<typeof useAuth>;
function Probe() {
  auth = useAuth();
  return <p>{auth.loading ? 'loading' : auth.session ? `signed in as ${'name' in auth.session.user ? auth.session.user.name : auth.session.user.fullName}` : 'signed out'}</p>;
}
const mount = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  queryClient.clear();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/auth/me')) return json(200, session);
    if (url.endsWith('/auth/logout')) return new Response(null, { status: 204 });
    if (url.endsWith('/academic-years')) return json(401, { error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } });
    throw new Error(`unexpected request ${init?.method ?? 'GET'} ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('AuthProvider', () => {
  test('restores an existing session on load', async () => {
    mount();
    expect(await screen.findByText('signed in as Ms Test')).toBeInTheDocument();
  });

  // Regression: logout used to clear the whole query cache, which detached the provider from the auth query, so the UI
  // kept showing the old session and /login redirected straight back into the app.
  test('logging out is reflected in the UI immediately', async () => {
    mount();
    await screen.findByText('signed in as Ms Test');
    await act(async () => {
      await auth.logout();
    });
    expect(await screen.findByText('signed out')).toBeInTheDocument();
    expect(auth.session).toBeNull();
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/auth/logout'))).toBe(true);
  });

  test('logout still ends the local session if the server cannot be reached', async () => {
    mount();
    await screen.findByText('signed in as Ms Test');
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/logout')) throw new TypeError('offline');
      return json(200, session);
    });
    await act(async () => {
      await auth.logout().catch(() => undefined);
    });
    expect(await screen.findByText('signed out')).toBeInTheDocument();
  });

  test('a 401 from any later request ends the session in the UI', async () => {
    const { api } = await import('@/lib/api');
    mount();
    await screen.findByText('signed in as Ms Test');
    await act(async () => {
      await api.get('/academic-years').catch(() => undefined);
    });
    await waitFor(() => expect(screen.getByText('signed out')).toBeInTheDocument());
  });

  test('logging in puts the CSRF token on the very next request', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/me')) return json(401, { error: { code: 'UNAUTHENTICATED', message: 'no' } });
      if (url.endsWith('/auth/teacher/login')) return json(200, session);
      if (url.endsWith('/classes')) return json(200, [{ csrf: (init?.headers as Record<string, string>)?.['X-CSRF-Token'] ?? null }]);
      throw new Error('unexpected ' + url);
    });
    mount();
    await screen.findByText('signed out');
    await act(async () => {
      await auth.loginTeacher('Ms Test');
    });
    expect(await screen.findByText('signed in as Ms Test')).toBeInTheDocument();
    const { api } = await import('@/lib/api');
    await api.post('/classes').catch(() => undefined); // any unsafe request
    const post = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith('/classes') && (i as RequestInit)?.method === 'POST');
    expect((post![1] as RequestInit).headers).toMatchObject({ 'X-CSRF-Token': 'csrf-1' });
  });
});
