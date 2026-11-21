import { useQuery } from '@tanstack/react-query';
import { Download, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useWorkspace } from '@/hooks/useWorkspace';
import { api, errorMessage } from '@/lib/api';
import { fmtMarks, fmtPercent, plural, TERM_LABELS, TERMS } from '@/lib/format';
import type { Examination, Ranking, Term } from '@/lib/types';
import { cn } from '@/lib/utils';

type Kind = 'index' | 'assessment' | 'exam';
type Scope = 'section' | 'class';

export default function Rankings() {
  const { yearId, sectionId, year, section } = useWorkspace();
  const [kind, setKind] = useState<Kind>('index');
  const [scope, setScope] = useState<Scope>('section');
  const [term, setTerm] = useState<Term>(1);
  const [examId, setExamId] = useState('');

  const exams = useQuery({ queryKey: ['examinations', 'list', yearId, sectionId, 'all'], queryFn: () => api.get<Examination[]>('/examinations', { academicYearId: yearId, sectionId }), enabled: !!yearId && !!sectionId && kind === 'exam' });
  const examList = exams.data ?? [];
  useEffect(() => {
    if (kind === 'exam' && examList.length && !examList.some((x) => x.id === examId)) setExamId(examList[0]!.id);
  }, [kind, examList, examId]);
  useEffect(() => setExamId(''), [sectionId, yearId]);

  const ready = !!yearId && !!sectionId && (kind !== 'exam' || !!examId);
  const params = { academicYearId: yearId, sectionId, scope, kind, term: kind === 'assessment' ? term : undefined, examId: kind === 'exam' ? examId : undefined };
  const ranking = useQuery({ queryKey: ['rankings', yearId, sectionId, scope, kind, kind === 'assessment' ? term : '', kind === 'exam' ? examId : ''], queryFn: () => api.get<Ranking>('/rankings', params), enabled: ready });

  if (!yearId || !sectionId) return <EmptyState icon={Trophy} title="Create an academic year first" description="Rankings are calculated per academic year." action={<Button asChild><Link to="/academic-years">Academic years</Link></Button>} />;
  const r = ranking.data;

  return (
    <div>
      <PageHeader
        title="Rankings"
        description={`Class ${section?.label} · ${year?.label}. Only students with a complete result are ranked; students without one are listed separately and never counted as zero. Equal scores share a rank.`}
        actions={<Button variant="outline" size="sm" disabled={!ready} onClick={() => void api.download('/exports/rankings', params).then((n) => toast.success(`Downloaded ${n}`)).catch((e) => toast.error(errorMessage(e)))}><Download /> Export</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
          <SelectTrigger size="sm" aria-label="Ranking basis" className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="index">Overall performance index</SelectItem>
            <SelectItem value="assessment">Continuous assessment</SelectItem>
            <SelectItem value="exam">Examination</SelectItem>
          </SelectContent>
        </Select>
        {kind === 'assessment' && (
          <Select value={String(term)} onValueChange={(v) => setTerm(Number(v) as Term)}>
            <SelectTrigger size="sm" aria-label="Term" className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={String(t)}>{TERM_LABELS[t]}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {kind === 'exam' && (
          <Select value={examId} onValueChange={setExamId} disabled={!examList.length}>
            <SelectTrigger size="sm" aria-label="Examination" className="w-64"><SelectValue placeholder={exams.isPending ? 'Loading…' : 'No examinations'} /></SelectTrigger>
            <SelectContent>{examList.map((x) => <SelectItem key={x.id} value={x.id}>{x.name} · {x.termLabel}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
          <SelectTrigger size="sm" aria-label="Scope" className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="section">Section {section?.label} only</SelectItem>
            <SelectItem value="class">Whole class</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {kind === 'exam' && !exams.isPending && !examList.length ? (
        <EmptyState icon={Trophy} title="No examinations to rank" description={`Create an examination for Class ${section?.label} first.`} action={<Button asChild><Link to="/examinations">Examinations</Link></Button>} />
      ) : ranking.isPending && ready ? (
        <Card className="p-0"><TableSkeleton cols={5} /></Card>
      ) : ranking.isError ? (
        <ErrorState error={ranking.error} onRetry={() => void ranking.refetch()} />
      ) : r ? (
        <div className="space-y-4">
          <Card className="overflow-hidden p-0">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">{r.title}</h2>
              <p className="text-xs text-muted-foreground">{r.context} · Sections {r.sections.join(', ')}</p>
            </div>
            {r.items.length === 0 ? (
              <div className="p-4"><EmptyState icon={Trophy} title="Nothing to rank yet" description="No student has a complete result for this selection. Enter marks first." /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-14">Rank</TableHead><TableHead>Student</TableHead><TableHead>Section</TableHead>
                    {r.kind !== 'index' && <TableHead className="text-right">Marks</TableHead>}
                    <TableHead className="text-right">{r.kind === 'index' ? 'Index' : 'Percentage'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.items.map((i) => (
                    <TableRow key={i.enrollmentId}>
                      <TableCell><span className={cn('tabular inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold', i.rank === 1 ? 'bg-state-partial/20 text-state-partial' : i.rank <= 3 ? 'bg-muted' : 'text-muted-foreground')}>{i.rank}</span></TableCell>
                      <TableCell className="font-medium"><Link to={`/students/${i.enrollmentId}`} className="hover:underline">{i.fullName}</Link><span className="ml-2 text-xs text-muted-foreground">{i.studentId}</span></TableCell>
                      <TableCell>{i.sectionLabel}</TableCell>
                      {r.kind !== 'index' && <TableCell className="tabular text-right">{fmtMarks(i.marks)} <span className="text-muted-foreground">/ {fmtMarks(i.max)}</span></TableCell>}
                      <TableCell className="tabular text-right font-medium">{fmtPercent(i.percent, 2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
          {r.unranked.length > 0 && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold">Not ranked ({r.unranked.length})</h3>
              <p className="mt-0.5 mb-2 text-xs text-muted-foreground">{plural(r.unranked.length, 'student')} without a complete result for this selection. These are missing, not zero.</p>
              <p className="text-[13px] leading-6">{r.unranked.map((u) => u.fullName).join(' · ')}</p>
            </Card>
          )}
        </div>
      ) : null}
    </div>
  );
}
