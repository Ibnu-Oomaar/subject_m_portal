import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, ErrorState, PageHeader, StateBadge, TableSkeleton } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useWorkspace } from '@/hooks/useWorkspace';
import { api, errorMessage } from '@/lib/api';
import { fmtDate, fmtMarks, TERM_LABELS, TERMS } from '@/lib/format';
import type { Examination, Term } from '@/lib/types';
import { ExamFormDialog } from './ExamFormDialog';

export default function Examinations() {
  const { yearId, sectionId, year, section, sections } = useWorkspace();
  const navigate = useNavigate();
  const [term, setTerm] = useState<'all' | Term>('all');
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: ['examinations', 'list', yearId, sectionId, term],
    queryFn: () => api.get<Examination[]>('/examinations', { academicYearId: yearId, sectionId, term: term === 'all' ? undefined : term }),
    enabled: !!yearId && !!sectionId,
  });
  const closed = year?.status === 'closed';

  if (!yearId || !sectionId) return <EmptyState icon={FileText} title="Create an academic year first" description="Examinations belong to an academic year." action={<Button asChild><Link to="/academic-years">Academic years</Link></Button>} />;

  return (
    <div>
      <PageHeader
        title="Examinations"
        description={`Class ${section?.label} · ${year?.label}${closed ? ' (closed, read only history)' : ''}. Create each examination with its own maximum marks, enter results, and review past examinations.`}
        actions={
          <>
            {term !== 'all' && (
              <Button variant="outline" size="sm" onClick={() => void api.download('/exports/exam-marks', { academicYearId: yearId, sectionId, term }).then((n) => toast.success(`Downloaded ${n}`)).catch((e) => toast.error(errorMessage(e)))}>
                <Download /> Export {TERM_LABELS[term]}
              </Button>
            )}
            <Button size="sm" onClick={() => setCreating(true)} disabled={closed} title={closed ? 'This academic year is closed' : undefined}>
              <Plus /> New examination
            </Button>
          </>
        }
      />

      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Term</span>
        <Select value={String(term)} onValueChange={(v) => setTerm(v === 'all' ? 'all' : (Number(v) as Term))}>
          <SelectTrigger size="sm" aria-label="Filter by term" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All terms</SelectItem>
            {TERMS.map((t) => <SelectItem key={t} value={String(t)}>{TERM_LABELS[t]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden p-0">
        {list.isPending ? (
          <TableSkeleton cols={6} />
        ) : list.isError ? (
          <div className="p-4"><ErrorState error={list.error} onRetry={() => void list.refetch()} /></div>
        ) : list.data.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={FileText} title="No examinations yet" description={term === 'all' ? `No examinations have been created for Class ${section?.label} in ${year?.label}.` : `No ${TERM_LABELS[term]} examinations for Class ${section?.label}.`} action={!closed && <Button onClick={() => setCreating(true)}><Plus /> New examination</Button>} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Examination</TableHead>
                <TableHead>Term</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Maximum</TableHead>
                <TableHead className="min-w-40">Marks entered</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.map((x) => (
                <TableRow key={x.id} className="cursor-pointer" onClick={() => navigate(`/examinations/${x.id}`)}>
                  <TableCell className="font-medium">
                    <Link to={`/examinations/${x.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{x.name}</Link>
                  </TableCell>
                  <TableCell>{x.termLabel}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(x.examDate)}</TableCell>
                  <TableCell className="tabular text-right">{fmtMarks(x.maxMarks)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={x.enrolled ? (x.entered / x.enrolled) * 100 : 0} className="w-24" aria-label="Marks entered" />
                      <span className="tabular text-xs text-muted-foreground">{x.entered}/{x.enrolled}</span>
                    </div>
                  </TableCell>
                  <TableCell><StateBadge state={x.state} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ExamFormDialog open={creating} onOpenChange={setCreating} yearId={yearId} sections={sections} defaultSectionId={sectionId} defaultTerm={term === 'all' ? 1 : term} onSaved={(created) => created.length === 1 && navigate(`/examinations/${created[0]!.id}`)} />
    </div>
  );
}
