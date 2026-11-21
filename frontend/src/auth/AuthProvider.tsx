import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { api, ApiError, setCsrfToken, setUnauthenticatedHandler } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import type { Session } from '@/lib/types';

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  /** Set when the session check failed for a reason other than "not signed in" (server down, etc.). */
  error: Error | null;
  retry: () => void;
  loginTeacher: (name: string, passcode?: string) => Promise<void>;
  loginStudent: (studentId: string) => Promise<void>;
  logout: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | null>(null);
const ME_KEY = ['auth', 'me'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const me = useQuery<Session | null>({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await api.get<Session>('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null; // simply not signed in
        throw e;
      }
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const session = me.data ?? null;

  useEffect(() => {
    setCsrfToken(session?.csrfToken ?? '');
  }, [session]);

  // Any later 401 (session expired or ended elsewhere) returns the user to the login page and drops cached data.
  useEffect(() => {
    setUnauthenticatedHandler(() => {
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
      queryClient.setQueryData(ME_KEY, null);
    });
    return () => setUnauthenticatedHandler(null);
  }, []);

  const start = useCallback((next: Session) => {
    setCsrfToken(next.csrfToken); // set synchronously so the very next request already carries it
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    queryClient.setQueryData(ME_KEY, next);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading: me.isPending,
      error: me.isError ? me.error : null,
      retry: () => void me.refetch(),
      loginTeacher: async (name, passcode) => start(await api.post<Session>('/auth/teacher/login', { name, passcode: passcode || undefined }, { auth: false })),
      loginStudent: async (studentId) => start(await api.post<Session>('/auth/student/login', { studentId }, { auth: false })),
      logout: async () => {
        try {
          await api.post('/auth/logout');
        } finally {
          setCsrfToken('');
          // Drop everything cached for the signed-in person, but keep the auth query itself in the cache: removing it
          // would detach AuthProvider's observer, which would then never hear that the session ended.
          queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
          queryClient.setQueryData(ME_KEY, null);
        }
      },
    }),
    [session, me.isPending, me.isError, me.error, me, start],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
