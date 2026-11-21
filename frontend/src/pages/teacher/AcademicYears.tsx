import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronDown, ChevronRight, Plus, Upload } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { ConfirmDialog, EmptyState, ErrorState, FieldError, PageHeader, TableSkeleton, YearStatusBadge } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { invalidateResults } from '@/lib/queryClient';
import type { AcademicYear, YearSummary } from '@/lib/types';

const schema = z.object({
  label: z.string().trim().regex(/^\d{4}\/\d{4}$/, 'Use the format 2026/2027').refine((v) => Number(v.slice(5)) === Number(v.slice(0, 4)) + 1, 'The second year must follow the first (for example 2026/2027)'),
});
type Form = z.infer<typeof schema>;

function CreateDialog({ open, onOpenChange, suggestion }: { open: boolean; onOpenChange: (o: boolean) => void; suggestion: string }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { label: suggestion } });
  useEffect(() => {
    if (open) {
      form.reset({ label: suggestion });
      setServerError(null);
    }
  }, [open, suggestion, form]);
  const create = useMutation({
    mutationFn: (v: Form) => api.post<AcademicYear>('/academic-years', v),
    onSuccess: (y) => {
      toast.success(`Academic year ${y.label} created${y.status === 'active' ? ' and set as the active year' : ''}.`);
      void invalidateResults();
      onOpenChange(false);
    },
    onError: (e) => setServerError(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !create.isPending && onOpenChange(o)}>
      <DialogContent>
        <form noValidate className="grid gap-4" onSubmit={form.handleSubmit((v) => { setServerError(null); create.mutate(v); })}>
          <DialogHeader>
            <DialogTitle>New academic year</DialogTitle>
            <DialogDescription>Earlier years and all their marks stay exactly as they are. The first year you create becomes the active year.</DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="year-label" className="mb-1.5">Academic year</Label>
            <Input id="year-label" autoFocus autoComplete="off" placeholder="2026/2027" aria-invalid={!!form.formState.errors.label} {...form.register('label')} />
            <FieldError>{form.formState.errors.label?.message}</FieldError>
          </div>
          {serverError && <FieldError>{serverError}</FieldError>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
            <Button type="submit" loading={create.isPending}>Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SectionSummary({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['academic-years', 'summary', id], queryFn: () => api.get<YearSummary>(`/academic-years/${id}/summary`) });
  if (q.isPending) return <Skeleton className="h-20" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {q.data.sections.map((s) => (
        <div key={s.sectionId} className="rounded-lg border bg-card p-2.5 text-xs">
          <p className="text-[13px] font-semibold">Class {s.label}</p>
          <p className="mt-1 text-muted-foreground"><span className="tabular text-foreground">{s.students}</span> students</p>
          <p className="text-muted-foreground"><span className="tabular text-foreground">{s.examinations}</span> examinations</p>
          <p className="text-muted-foreground"><span className="tabular text-foreground">{s.assessmentRecords}</span> assessments</p>
        </div>
      ))}
    </div>
  );
}

export default function AcademicYears() {
  const years = useQuery({ queryKey: ['academic-years'], queryFn: () => api.get<AcademicYear[]>('/academic-years') });
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'activate' | 'close'; year: AcademicYear } | null>(null);

  const act = useMutation({
    mutationFn: ({ kind, year }: { kind: 'activate' | 'close'; year: AcademicYear }) => api.post(`/academic-years/${year.id}/${kind}`),
    onSuccess: (_r, { kind, year }) => {
      toast.success(kind === 'activate' ? `${year.label} is now the active year.` : `${year.label} was closed.`);
      void invalidateResults();
      setConfirm(null);
    },
    onError: (e) => {
      toast.error('Could not change the academic year', { description: errorMessage(e) });
      setConfirm(null);
    },
  });

  const list = [...(years.data ?? [])].sort((a, b) => b.startYear - a.startYear);
  const suggestion = list.length ? `${list[0]!.startYear + 1}/${list[0]!.startYear + 2}` : `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`;
  const active = list.find((y) => y.status === 'active');

  return (
    <div>
      <PageHeader
        title="Academic years"
        description="Each year has its own students, assessments, examinations and results. Closing or switching years never deletes anything: earlier records stay available for review, reports and student progression."
        actions={<Button size="sm" onClick={() => setCreating(true)}><Plus /> New academic year</Button>}
      />
      <Card className="overflow-hidden p-0">
        {years.isPending ? (
          <TableSkeleton rows={3} cols={4} />
        ) : years.isError ? (
          <div className="p-4"><ErrorState error={years.error} onRetry={() => void years.refetch()} /></div>
        ) : list.length === 0 ? (
          <div className="p-4"><EmptyState icon={CalendarDays} title="No academic years yet" description="Create the first one, for example 2026/2027, then import your students." action={<Button onClick={() => setCreating(true)}><Plus /> New academic year</Button>} /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8"><span className="sr-only">Details</span></TableHead>
                <TableHead>Academic year</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Students</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((y) => (
                <Fragment key={y.id}>
                  <TableRow>
                    <TableCell className="pr-0">
                      <Button variant="ghost" size="icon-sm" aria-expanded={expanded === y.id} aria-label={`${expanded === y.id ? 'Hide' : 'Show'} sections of ${y.label}`} onClick={() => setExpanded(expanded === y.id ? null : y.id)}>
                        {expanded === y.id ? <ChevronDown /> : <ChevronRight />}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">{y.label}</TableCell>
                    <TableCell><YearStatusBadge status={y.status} /></TableCell>
                    <TableCell className="tabular text-right">{y.studentCount}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1.5">
                        {y.status !== 'closed' && <Button asChild variant="ghost" size="sm"><Link to="/import" onClick={() => localStorage.setItem('mp-import-year', y.id)}><Upload /> Import</Link></Button>}
                        {y.status === 'planned' && <Button variant="outline" size="sm" onClick={() => setConfirm({ kind: 'activate', year: y })}>Make active</Button>}
                        {y.status === 'active' && <Button variant="outline" size="sm" onClick={() => setConfirm({ kind: 'close', year: y })}>Close year</Button>}
                        {y.status === 'closed' && <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: 'activate', year: y })}>Reopen</Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                  {expanded === y.id && <TableRow className="hover:bg-transparent"><TableCell /><TableCell colSpan={4} className="bg-muted/30 py-3"><SectionSummary id={y.id} /></TableCell></TableRow>}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <CreateDialog open={creating} onOpenChange={setCreating} suggestion={suggestion} />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && !act.isPending && setConfirm(null)}
        loading={act.isPending}
        destructive={confirm?.kind === 'close'}
        title={confirm?.kind === 'close' ? `Close ${confirm.year.label}?` : confirm?.year.status === 'closed' ? `Reopen ${confirm.year.label}?` : `Make ${confirm?.year.label} the active year?`}
        confirmLabel={confirm?.kind === 'close' ? 'Close year' : confirm?.year.status === 'closed' ? 'Reopen year' : 'Make active'}
        onConfirm={() => confirm && act.mutate(confirm)}
        description={
          confirm?.kind === 'close' ? (
            <p>Marks in a closed year become read-only: changing one afterwards needs a written correction reason. Nothing is deleted, and you can still view, export and report on it.</p>
          ) : (
            <p>{active && active.id !== confirm?.year.id ? `${active.label} will be closed (its marks become read-only; nothing is deleted). ` : ''}New marks and imports will go to {confirm?.year.label} by default.</p>
          )
        }
      />
    </div>
  );
}
