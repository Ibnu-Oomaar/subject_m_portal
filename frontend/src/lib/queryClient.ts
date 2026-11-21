import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      // Client mistakes (400-499) never succeed on retry; only transient failures are retried.
      retry: (count, error) => (error instanceof ApiError && error.status >= 400 && error.status < 500 ? false : count < 2),
    },
    mutations: { retry: false },
  },
});

/** Everything that depends on marks or enrolments: refreshed after a save, an import, or a change made elsewhere. */
export function invalidateResults(): Promise<unknown> {
  return Promise.all(
    ['assessments', 'examinations', 'analytics', 'dashboard', 'rankings', 'profile', 'students', 'academic-years', 'me'].map((k) => queryClient.invalidateQueries({ queryKey: [k] })),
  );
}
