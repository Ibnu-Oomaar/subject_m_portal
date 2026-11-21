import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, ClipboardList, FileText, LayoutDashboard, Trophy, Upload, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BarChartView, hasValues } from '@/components/charts/Charts';
import { CardSkeleton, EmptyState, ErrorState, PageHeader, StatCard, TrendBadge, YearStatusBadge } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useWorkspace } from '@/hooks/useWorkspace';
import { api } from '@/lib/api';
import { fmtAgo, fmtPercent, TERM_LABELS } from '@/lib/format';
import type { Dashboard as DashboardData } from '@/lib/types';

const ACTIVITY: Record<string, string> = {
  'assessment.create': 'Entered assessment marks',
  'assessment.update': 'Changed assessment marks',
  'assessment.correction': 'Corrected finalized assessment marks',
  'assessment.finalize': 'Finalized assessments',
  'exam_mark.create': 'Entered examination marks',
  'exam_mark.update': 'Changed examination marks',
  'exam_mark.correction': 'Corrected finalized examination marks',
  'exam_mark.clear': 'Cleared examination marks',
  'exam_mark.finalize': 'Finalized examination marks',
  'examination.create': 'Created an examination',
  'examination.update': 'Updated an examination',
  'examination.delete': 'Deleted an examination',
  'enrollment.create': 'Enrolled a student',
  'student.rename': 'Renamed a student',
  'student.import': 'Imported students',
  'academic_year.create': 'Created an academic year',
  'academic_year.activate': 'Activated an academic year',
  'academic_year.close': 'Closed an academic year',
};

function describe(a: NonNullable<DashboardData['recentActivity']>[number]): string {
  const c = a.context ?? {};
  const bits: string[] = [];
  if (a.count > 1) bits.push(`${a.count} students`);
  else if (typeof c.fullName === 'string') bits.push(c.fullName);
  if (typeof c.examName === 'string') bits.push(c.examName);
  else if (typeof c.term === 'number') bits.push(TERM_LABELS[c.term as 1 | 2 | 3]);
  if (typeof c.sectionLabel === 'string') bits.push(`Class ${c.sectionLabel}`);
  return bits.join(' · ');
}

export default function Dashboard() {
  const { yearId, year } = useWorkspace();
  const query = useQuery({ queryKey: ['dashboard', yearId], queryFn: () => api.get<DashboardData>('/analytics/dashboard', { academicYearId: yearId }), enabled: !!yearId });

  if (!yearId) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <EmptyState icon={LayoutDashboard} title="Create your first academic year" description="Everything in the portal belongs to an academic year, such as 2026/2027. Create one, then import your students." action={<Button asChild><Link to="/academic-years">Create academic year</Link></Button>} />
      </>
    );
  }
  const d = query.data;
  const completion = d?.assessmentCompletion && d.examCompletion ? d.assessmentCompletion.byTerm.map((t, i) => ({ term: TERM_LABELS[t.term], Assessments: t.percent, Examinations: d.examCompletion!.byTerm[i]?.percent ?? null })) : [];
  const sectionAvg = (d?.sections ?? []).filter((s) => s.students > 0).map((s) => ({ section: s.label, average: s.averageIndex }));

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={<span className="inline-flex items-center gap-2">Academic year {year?.label} {year && <YearStatusBadge status={year.status} />}</span>}
        actions={<Button asChild size="sm" variant="outline"><Link to="/import"><Upload /> Import students</Link></Button>}
      />
      {query.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <CardSkeleton key={i} />)}</div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : d!.totals.students === 0 ? (
        <EmptyState icon={Users} title={`No students in ${year?.label} yet`} description="Import the class lists from Excel or CSV, or add students one by one. The dashboard fills in as marks are entered." action={<div className="flex gap-2"><Button asChild><Link to="/import"><Upload /> Import students</Link></Button><Button asChild variant="outline"><Link to="/students">Add a student</Link></Button></div>} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Users} label="Students" value={d!.totals.students} hint={`${d!.totals.sectionsWithStudents ?? 0} of ${d!.totals.sections} sections have students`} />
            <StatCard icon={ClipboardList} label="Assessments complete" value={fmtPercent(d!.assessmentCompletion?.percent ?? null, 0)} hint={`${d!.assessmentCompletion?.entered ?? 0} of ${d!.assessmentCompletion?.expected ?? 0} student-terms`} />
            <StatCard icon={FileText} label="Examination marks entered" value={d!.examCompletion?.examinations ? fmtPercent(d!.examCompletion.percent, 0) : '—'} hint={d!.examCompletion?.examinations ? `${d!.examCompletion.examinations} examinations · ${d!.examCompletion.entered}/${d!.examCompletion.expected} marks` : 'No examinations created yet'} />
            <StatCard icon={AlertTriangle} label="Need attention" value={new Set((d!.attention ?? []).map((a) => a.enrollmentId)).size} hint={`${d!.counts?.exceptional ?? 0} exceptional · ${d!.counts?.improving ?? 0} improving · ${d!.counts?.declining ?? 0} declining`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Data entry progress</CardTitle>
                <CardDescription>Share of expected assessments and examination marks entered, by term.</CardDescription>
              </CardHeader>
              <CardContent>
                {hasValues(completion, ['Assessments', 'Examinations']) ? <BarChartView data={completion} xKey="term" series={[{ key: 'Assessments', name: 'Assessments' }, { key: 'Examinations', name: 'Examinations' }]} yMax={100} unit="%" ariaLabel="Bar chart of data entry progress by term" /> : <p className="py-10 text-center text-[13px] text-muted-foreground">No marks have been entered yet.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Average performance by section</CardTitle>
                <CardDescription>Performance index (average of term averages). Sections without results are not shown.</CardDescription>
              </CardHeader>
              <CardContent>
                {hasValues(sectionAvg, ['average']) ? <BarChartView data={sectionAvg.filter((s) => s.average !== null)} xKey="section" series={[{ key: 'average', name: 'Average index' }]} yMax={100} unit="%" ariaLabel="Bar chart of average performance index by section" /> : <p className="py-10 text-center text-[13px] text-muted-foreground">Section averages appear once complete results exist.</p>}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div className="space-y-1"><CardTitle className="flex items-center gap-1.5"><Trophy className="size-4" /> Top students</CardTitle><CardDescription>By performance index</CardDescription></div>
                <Button asChild variant="ghost" size="sm"><Link to="/rankings">All rankings</Link></Button>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                {(d!.topStudents ?? []).length === 0 ? <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">No complete results yet.</p> : (
                  <Table>
                    <TableHeader><TableRow className="hover:bg-transparent"><TableHead className="w-10">#</TableHead><TableHead>Student</TableHead><TableHead>Section</TableHead><TableHead className="text-right">Index</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {d!.topStudents!.map((s) => (
                        <TableRow key={s.enrollmentId}>
                          <TableCell className="tabular text-muted-foreground">{s.rank}</TableCell>
                          <TableCell className="font-medium"><Link to={`/students/${s.enrollmentId}`} className="hover:underline">{s.fullName}</Link></TableCell>
                          <TableCell>{s.sectionLabel}</TableCell>
                          <TableCell className="tabular text-right">{fmtPercent(s.index)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5"><AlertTriangle className="size-4" /> Students who may need support</CardTitle>
                <CardDescription>{d!.thresholds ? `Index below ${d!.thresholds.lowBelow}%, below ${d!.thresholds.supportBelow}%, or declining while under ${d!.thresholds.decliningSupportBelow}%.` : ''}</CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                {(d!.attention ?? []).length === 0 ? <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">No students are flagged right now.</p> : (
                  <Table>
                    <TableBody>
                      {d!.attention!.map((s) => (
                        <TableRow key={s.enrollmentId}>
                          <TableCell className="font-medium"><Link to={`/students/${s.enrollmentId}`} className="hover:underline">{s.fullName}</Link><span className="ml-2 text-xs text-muted-foreground">{s.sectionLabel}</span></TableCell>
                          <TableCell className="tabular text-right">{fmtPercent(s.index)}</TableCell>
                          <TableCell className="text-right">{s.needsSupport ? <Badge variant="destructive">Needs support</Badge> : <TrendBadge trend={s.trend} delta={s.trendDelta} />}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5"><Activity className="size-4" /> Recent activity</CardTitle>
              <CardDescription>Every marks change is recorded with who made it and when.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {(d!.recentActivity ?? []).length === 0 ? <p className="py-6 text-center text-[13px] text-muted-foreground">Nothing has been recorded yet.</p> : (
                <ul className="divide-y">
                  {d!.recentActivity!.map((a, i) => (
                    <li key={`${a.batchId ?? i}-${a.at}`} className="flex items-baseline gap-3 py-2">
                      <span className="text-[13px] font-medium">{ACTIVITY[a.action] ?? a.action}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{describe(a)}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{a.actorName ? `${a.actorName} · ` : ''}{fmtAgo(a.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
