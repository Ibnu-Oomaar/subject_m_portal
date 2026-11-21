import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Download, History, Lock, LockOpen, Pencil, Save, Search, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Banner, ConfirmDialog, EmptyState, ErrorState, PageHeader, StateBadge, StatCard, TableSkeleton } from '@/components/common';
import { CorrectionDialog } from '@/components/CorrectionDialog';
import { HistorySheet } from '@/components/HistoryPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api, ApiError, errorMessage } from '@/lib/api';
import { fmtDate, fmtMarks, fmtPercent, markProblem, parseMark, plural } from '@/lib/format';
import { invalidateResults } from '@/lib/queryClient';
import type { ExamSheet, ExamSheetRow, FinalizeResult, ResultState, SaveResult } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ExamFormDialog } from './ExamFormDialog';
import { useWorkspace } from '@/hooks/useWorkspace';

type Filter = 'all' | ResultState;

export default function ExaminationDetail() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { sections } = useWorkspace();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [bases, setBases] = useState<Record<string, number>>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [correctionMode, setCorrectionMode] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<ExamSheetRow | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const sheetQuery = useQuery({ queryKey: ['examinations', 'sheet', examId], queryFn: () => api.get<ExamSheet>(`/examinations/${examId}/sheet`), enabled: !!examId });
  const sheet = sheetQuery.data;
  const exam = sheet?.examination;
  const max = exam?.maxMarks ?? 0;

  const dirtyIds = Object.keys(drafts);
  useEffect(() => {
    if (!dirtyIds.length) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyIds.length]);

  const setCell = (row: ExamSheetRow, text: string) => {
    setServerErrors((e) => ({ ...e, [row.enrollmentId]: '' }));
    const same = parseMark(text) === row.marks;
    setDrafts((d) => {
      const next = { ...d };
      if (same) delete next[row.enrollmentId];
      else next[row.enrollmentId] = text;
      return next;
    });
    setBases((b) => {
      const next = { ...b };
      if (same) delete next[row.enrollmentId];
      else next[row.enrollmentId] ??= row.version;
      return next;
    });
  };
  const clearRows = (ids: string[]) => {
    setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !ids.includes(k))));
    setBases((b) => Object.fromEntries(Object.entries(b).filter(([k]) => !ids.includes(k))));
  };
  const staleRows = useMemo(() => (sheet ? sheet.rows.filter((r) => bases[r.enrollmentId] !== undefined && bases[r.enrollmentId] !== r.version) : []), [sheet, bases]);
  const problems = dirtyIds.filter((id) => markProblem(drafts[id]!, max)).length;

  const save = useMutation({
    mutationFn: (reason?: string) =>
      api.put<SaveResult>(`/examinations/${examId}/marks`, {
        correctionReason: reason,
        entries: dirtyIds.map((id) => ({ enrollmentId: id, version: bases[id] ?? 0, marks: parseMark(drafts[id]!) })),
      }),
    onSuccess: (res) => {
      const saved = dirtyIds;
      clearRows(saved);
      setReasonOpen(false);
      const parts = [res.created && `${res.created} new`, res.updated && `${res.updated} updated`, res.corrected && `${res.corrected} corrected`, res.cleared && `${res.cleared} cleared`].filter(Boolean);
      toast.success(parts.length ? `Saved: ${parts.join(', ')}.` : 'Nothing had changed.');
      void invalidateResults();
    },
    onError: (e) => {
      setReasonOpen(false);
      if (e instanceof ApiError && e.code === 'CONCURRENT_MODIFICATION') {
        toast.error('Some marks were changed by someone else', { description: 'Review the highlighted rows, then keep your values or use the latest ones.' });
        void sheetQuery.refetch();
      } else if (e instanceof ApiError && e.code === 'RECORD_LOCKED') {
        setReasonOpen(true);
      } else if (e instanceof ApiError && e.fieldErrors.length) {
        const next: Record<string, string> = {};
        for (const fe of e.fieldErrors) {
          const m = /^entries\.(\d+)\./.exec(fe.path);
          const id = m ? dirtyIds[Number(m[1])] : undefined;
          if (id) next[id] = fe.message;
        }
        setServerErrors(next);
        toast.error('Some entries are not valid', { description: e.fieldErrors[0]?.message });
      } else {
        toast.error('Could not save', { description: errorMessage(e) });
      }
    },
  });
  const finalize = useMutation({
    mutationFn: () => api.post<FinalizeResult>(`/examinations/${examId}/finalize`, {}),
    onSuccess: (r) => {
      setFinalizeOpen(false);
      toast.success(`Finalized ${plural(r.finalized, 'result')}.`, { description: r.missing ? `${r.missing} students have no mark yet.` : undefined });
      void invalidateResults();
    },
    onError: (e) => {
      setFinalizeOpen(false);
      toast.error('Could not finalize', { description: errorMessage(e) });
    },
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/examinations/${examId}`),
    onSuccess: () => {
      toast.success('Examination deleted.');
      void invalidateResults();
      navigate('/examinations', { replace: true });
    },
    onError: (e) => {
      setDeleteOpen(false);
      toast.error('Could not delete', { description: errorMessage(e) });
    },
  });

  const rows = useMemo(() => {
    if (!sheet) return [];
    const q = search.trim().toLowerCase();
    return sheet.rows.filter((r) => (filter === 'all' || r.state === filter) && (!q || r.fullName.toLowerCase().includes(q) || r.studentId.toLowerCase().includes(q)));
  }, [sheet, filter, search]);

  const needsReason = !!sheet && (sheet.locked || dirtyIds.some((id) => sheet.rows.find((r) => r.enrollmentId === id)?.state === 'finalized'));
  const requestSave = () => {
    if (problems) return toast.error(`Fix ${plural(problems, 'entry', 'entries')} marked in red before saving.`);
    if (needsReason) setReasonOpen(true);
    else save.mutate(undefined);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>, r: number) => {
    const move = e.key === 'Enter' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!move) return;
    e.preventDefault();
    tableRef.current?.querySelector<HTMLInputElement>(`input[data-r="${r + move}"]:not(:disabled)`)?.focus();
  };

  if (sheetQuery.isPending) return <div className="space-y-3"><div className="h-8 w-64 animate-pulse rounded-md bg-muted" /><Card className="overflow-hidden p-0"><TableSkeleton rows={8} cols={5} /></Card></div>;
  if (sheetQuery.isError) {
    const notFound = sheetQuery.error instanceof ApiError && (sheetQuery.error.status === 404 || sheetQuery.error.status === 403);
    return notFound ? <EmptyState title="Examination not found" description="It may have been deleted, or it belongs to a section that is not yours." action={<Button asChild variant="outline"><Link to="/examinations">Back to examinations</Link></Button>} /> : <ErrorState error={sheetQuery.error} onRetry={() => void sheetQuery.refetch()} />;
  }
  if (!sheet || !exam) return null;
  const sum = sheet.summary;
  const filters: Array<{ value: Filter; label: string; count: number }> = [
    { value: 'all', label: 'All', count: sum.students },
    { value: 'missing', label: 'Missing', count: sum.missing },
    { value: 'entered', label: 'Entered', count: sum.entered },
    { value: 'finalized', label: 'Finalized', count: sum.finalized },
  ];

  return (
    <div className="pb-20">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground">
        <Link to="/examinations"><ArrowLeft /> Examinations</Link>
      </Button>
      <PageHeader
        title={exam.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{exam.termLabel}</span>
            <span>Class {exam.sectionLabel} · {sheet.academicYear.label}</span>
            <span>{fmtDate(exam.examDate)}</span>
            <Badge variant="secondary" className="tabular">Maximum {fmtMarks(exam.maxMarks)}</Badge>
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void api.download('/exports/exam-marks', { academicYearId: exam.academicYearId, sectionId: exam.sectionId, examId: exam.id }).then((n) => toast.success(`Downloaded ${n}`)).catch((e) => toast.error(errorMessage(e)))}><Download /> Export</Button>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} disabled={sheet.locked}><Pencil /> Edit</Button>
            <Button variant="outline" size="sm" disabled={dirtyIds.length > 0 || sum.entered === 0} onClick={() => setFinalizeOpen(true)}><Lock /> Finalize</Button>
            <Button variant="ghost" size="icon" aria-label="Delete examination" disabled={sum.entered + sum.finalized > 0 || sheet.locked} title={sum.entered + sum.finalized > 0 ? 'An examination with marks cannot be deleted' : 'Delete examination'} onClick={() => setDeleteOpen(true)}><Trash2 /></Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Marks entered" value={`${sum.entered + sum.finalized}/${sum.students}`} hint={sum.missing ? `${sum.missing} missing` : 'Complete'} />
        <StatCard label="Average" value={sum.average === null ? '—' : fmtMarks(sum.average)} hint={sum.averagePercent === null ? 'No marks yet' : fmtPercent(sum.averagePercent)} />
        <StatCard label="Highest" value={fmtMarks(sum.highest)} />
        <StatCard label="Lowest" value={fmtMarks(sum.lowest)} />
      </div>

      {sheet.locked && <Banner tone="warning" icon={Lock}><strong>{sheet.academicYear.label} is closed.</strong> Marks are read-only. Turn on corrections to change one; a reason is required and recorded.</Banner>}
      {staleRows.length > 0 && (
        <Banner tone="warning" icon={AlertTriangle}>
          <p><strong>{plural(staleRows.length, 'mark')}</strong> {staleRows.length === 1 ? 'was' : 'were'} changed by someone else while you were editing.</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setBases((b) => ({ ...b, ...Object.fromEntries(staleRows.map((r) => [r.enrollmentId, r.version])) }))}>Keep my values</Button>
            <Button size="sm" variant="outline" onClick={() => clearRows(staleRows.map((r) => r.enrollmentId))}>Use the latest values</Button>
          </div>
        </Banner>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by status">
          {filters.map((f) => (
            <Button key={f.value} size="sm" variant={filter === f.value ? 'secondary' : 'ghost'} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label} <span className="tabular text-muted-foreground">{f.count}</span>
            </Button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-60">
          <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or ID" className="pl-8" aria-label="Search students" />
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        {sheet.rows.length === 0 ? (
          <div className="p-4"><EmptyState title="No students in this section" description="Import or add students for this academic year first." /></div>
        ) : (
          <div className="relative overflow-x-auto">
            <table ref={tableRef} className="w-full min-w-[560px] text-[13px]">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="w-28 px-3 py-2 text-left font-medium">Student ID</th>
                  <th className="px-3 py-2 text-left font-medium">Student</th>
                  <th className="w-32 px-2 py-2 text-center font-medium">Marks <span className="tabular font-normal">/ {fmtMarks(max)}</span></th>
                  <th className="w-20 px-2 py-2 text-right font-medium">%</th>
                  <th className="w-28 px-3 py-2 text-left font-medium">Status</th>
                  <th className="w-10 px-2 py-2"><span className="sr-only">History</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">No students match this filter.</td></tr>}
                {rows.map((row, r) => {
                  const dirty = drafts[row.enrollmentId] !== undefined;
                  const text = dirty ? drafts[row.enrollmentId]! : row.marks === null ? '' : String(row.marks);
                  const problem = markProblem(text, max) ?? (serverErrors[row.enrollmentId] || null);
                  const editable = !(row.state === 'finalized' || sheet.locked) || correctionMode;
                  const value = parseMark(text);
                  const livePercent = dirty && value !== null && !problem ? Math.round((value / max) * 10000) / 100 : null;
                  const stale = staleRows.some((s) => s.enrollmentId === row.enrollmentId);
                  return (
                    <tr key={row.enrollmentId} className={cn('border-b last:border-0 hover:bg-muted/30', dirty && 'bg-state-partial/5', stale && 'bg-destructive/5')}>
                      <td className="tabular px-3 py-1.5 text-muted-foreground">{row.studentId}</td>
                      <td className="px-3 py-1.5 font-medium">{row.fullName}</td>
                      <td className="px-2 py-1">
                        <Tooltip open={problem ? undefined : false}>
                          <TooltipTrigger asChild>
                            <input
                              data-r={r}
                              inputMode="decimal"
                              autoComplete="off"
                              disabled={!editable}
                              value={text}
                              placeholder="–"
                              aria-label={`${row.fullName}: marks out of ${fmtMarks(max)}`}
                              aria-invalid={!!problem}
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) => setCell(row, e.target.value)}
                              onKeyDown={(e) => onKey(e, r)}
                              className={cn('tabular h-8 w-full rounded-md border bg-card px-1 text-center outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/60 focus:ring-[3px] focus:ring-ring disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground', problem ? 'border-destructive bg-destructive/5' : dirty ? 'border-state-partial/70 bg-state-partial/10' : 'border-input')}
                            />
                          </TooltipTrigger>
                          <TooltipContent>{problem}</TooltipContent>
                        </Tooltip>
                      </td>
                      <td className="tabular px-2 py-1.5 text-right text-muted-foreground">{fmtPercent(dirty ? livePercent : row.percent)}</td>
                      <td className="px-3 py-1.5"><div className="flex items-center gap-1.5"><StateBadge state={row.state} />{dirty && <span className="size-1.5 rounded-full bg-state-partial" title="Unsaved changes" />}</div></td>
                      <td className="px-2 py-1.5"><Button variant="ghost" size="icon-sm" aria-label={`Change history for ${row.fullName}`} disabled={row.version === 0} onClick={() => setHistoryFor(row)}><History /></Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(sum.finalized > 0 || sheet.locked) && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Button variant={correctionMode ? 'secondary' : 'ghost'} size="sm" aria-pressed={correctionMode} onClick={() => setCorrectionMode((v) => !v)}>
            {correctionMode ? <LockOpen /> : <Lock />} {correctionMode ? 'Corrections on' : 'Correct finalized marks'}
          </Button>
          <span>Finalized marks are locked. Corrections need a reason and are kept in the history.</span>
        </div>
      )}

      {dirtyIds.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-popover/95 px-4 py-2.5 backdrop-blur md:left-[13.5rem]" role="region" aria-label="Unsaved changes">
          <div className="mx-auto flex max-w-[1200px] items-center gap-3">
            <Badge variant="warning">{plural(dirtyIds.length, 'mark')} changed</Badge>
            {problems > 0 && <span className="text-xs text-destructive">{plural(problems, 'entry', 'entries')} need attention</span>}
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" disabled={save.isPending} onClick={() => clearRows(dirtyIds)}><Undo2 /> Discard</Button>
              <Button size="sm" loading={save.isPending} onClick={requestSave}><Save /> Save changes</Button>
            </div>
          </div>
        </div>
      )}

      <CorrectionDialog open={reasonOpen} onOpenChange={setReasonOpen} count={dirtyIds.length} loading={save.isPending} onSubmit={(reason) => save.mutate(reason)} />
      <ConfirmDialog open={finalizeOpen} onOpenChange={setFinalizeOpen} loading={finalize.isPending} title={`Finalize “${exam.name}”?`} confirmLabel="Finalize" onConfirm={() => finalize.mutate()} description={<p>{plural(sum.entered, 'entered mark')} will be locked. Students without a mark stay open. Changing a finalized mark later needs a written reason.</p>} />
      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} loading={remove.isPending} destructive title="Delete this examination?" confirmLabel="Delete" onConfirm={() => remove.mutate()} description={<p>“{exam.name}” has no marks, so nothing is lost. Examinations that have marks can never be deleted.</p>} />
      <ExamFormDialog open={editOpen} onOpenChange={setEditOpen} yearId={exam.academicYearId} sections={sections} exam={exam} />
      <HistorySheet open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)} title={historyFor?.fullName ?? ''} description={`${exam.name} · ${historyFor?.studentId ?? ''}`} queryKey={['examinations', 'history', examId, historyFor?.enrollmentId]} path={`/examinations/${examId}/history/${historyFor?.enrollmentId ?? ''}`} />
    </div>
  );
}
