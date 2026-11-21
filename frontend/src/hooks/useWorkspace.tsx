import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import type { AcademicYear, SectionRef, TeacherMe } from '@/lib/types';

/**
 * The teacher's working context: which academic year and which section they are looking at.
 * Every screen reads it, so "only that section's students are shown" holds everywhere.
 */
interface WorkspaceValue {
  years: AcademicYear[];
  sections: SectionRef[];
  year: AcademicYear | undefined;
  section: SectionRef | undefined;
  yearId: string | undefined;
  sectionId: string | undefined;
  setYearId: (id: string) => void;
  setSectionId: (id: string) => void;
  loading: boolean;
  error: Error | null;
  retry: () => void;
}
const WorkspaceContext = createContext<WorkspaceValue | null>(null);
const STORAGE_KEY = 'mp-workspace';

function readStored(): { yearId?: string; sectionId?: string } {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { yearId?: string; sectionId?: string };
  } catch {
    return {};
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const yearsQuery = useQuery({ queryKey: ['academic-years'], queryFn: () => api.get<AcademicYear[]>('/academic-years') });
  const meQuery = useQuery({ queryKey: ['teacher', 'me'], queryFn: () => api.get<TeacherMe>('/teachers/me') });
  const [chosen, setChosen] = useState(readStored);

  const years = yearsQuery.data ?? [];
  const sections = useMemo(() => [...(meQuery.data?.sections ?? [])].sort((a, b) => a.label.localeCompare(b.label)), [meQuery.data]);

  // fall back to the active year (or the newest) and the first section when nothing valid is chosen
  const year = years.find((y) => y.id === chosen.yearId) ?? years.find((y) => y.status === 'active') ?? [...years].sort((a, b) => b.startYear - a.startYear)[0];
  const section = sections.find((s) => s.id === chosen.sectionId) ?? sections[0];

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ yearId: year?.id, sectionId: section?.id }));
    } catch {
      /* ignore */
    }
  }, [year?.id, section?.id]);

  const setYearId = useCallback((id: string) => setChosen((c) => ({ ...c, yearId: id })), []);
  const setSectionId = useCallback((id: string) => setChosen((c) => ({ ...c, sectionId: id })), []);

  const value: WorkspaceValue = {
    years,
    sections,
    year,
    section,
    yearId: year?.id,
    sectionId: section?.id,
    setYearId,
    setSectionId,
    loading: yearsQuery.isPending || meQuery.isPending,
    error: (yearsQuery.error ?? meQuery.error) as Error | null,
    retry: () => {
      void yearsQuery.refetch();
      void meQuery.refetch();
    },
  };
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ctx;
}
