import { useQuery } from '@tanstack/react-query';
import { BarChart3, Download, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { BarChartView, hasValues } from '@/components/charts/Charts';
import { CardSkeleton, EmptyState, ErrorState, PageHeader, StatCard, TrendBadge } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWorkspace } from '@/hooks/useWorkspace';
import { api, errorMessage } from '@/lib/api';
import { fmtDate, fmtMarks, fmtPercent, plural, TERM_LABELS, TERMS } from '@/lib/format';
import type { PersonRef, SectionAnalytics, Term } from '@/lib/types';

type Group = keyof SectionAnalytics['attention'];
const GROUPS: Array<{ key: Group; label: string; hint: string }> = [
  { key: 'exceptional', label: 'Exceptional', hint: 'Performing exceptionally well' },
  { key: 'low', label: 'Low', hint: 'Low academic performance' },
  { key: 'needsSupport', label: 'Needs support', hint: 'Requires additional support' },
  { key: 'improving', label: 'Improving', hint: 'Improving between terms' },
  { key: 'declining', label: 'Declining', hint: 'Declining between terms' },
];

function PeopleTable({ people, empty }: { people: PersonRef[]; empty: string }) {
  if (!people.length) return <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">{empty}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent"><TableHead>Student</TableHead><TableHead>Section</TableHead><TableHead className="text-right">Index</TableHead><TableHead>Trend</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {people.map((p) => (
          <TableRow key={p.enrollmentId}>
            <TableCell className="font-medium"><Link to={`/students/${p.enrollmentId}`} className="hover:underline">{p.fullName}</Link><span className="ml-2 text-xs text-muted-foreground">{p.studentId}</span></TableCell>
            <TableCell>{p.sectionLabel}</TableCell>
            <TableCell className="tabular text-right">{fmtPercent(p.index)}</TableCell>
            <TableCell><TrendBadge trend={p.trend} delta={p.trendDelta} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function Analytics() {
  const { yearId, sectionId, year, section } = useWorkspace();
  const [group, setGroup] = useState<Group>('needsSupport');
  const [term, setTerm] = useState<Term>(1);
  const query = useQuery({ queryKey: ['analytics', 'section', yearId, sectionId], queryFn: () => api.get<SectionAnalytics>('/analytics/section', { academicYearId: yearId, sectionId }), enabled: !!yearId && !!sectionId });

  if (!yearId || !sectionId) return <EmptyState icon={BarChart3} title="Create an academic year first" description="Analytics are calculated per academic year and section." action={<Button asChild><Link to="/academic-years">Academic years</Link></Button>} />;
  const a = query.data;

  return (
    <div>
      <PageHeader
        title="Analytics"
        description={`Class ${section?.label} · ${year?.label}. Calculated only from marks that have been entered; missing marks are never counted as zero.`}
        actions={<Button variant="outline" size="sm" onClick={() => void api.download('/exports/class-performance', { academicYearId: yearId, sectionId }).then((n) => toast.success(`Downloaded ${n}`)).catch((e) => toast.error(errorMessage(e)))}><Download /> Export performance</Button>}
      />
      {query.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <CardSkeleton key={i} />)}</div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : a!.totals.students === 0 ? (
        <EmptyState icon={Users} title={`No students in Class ${section?.label}`} description="Analytics appear once students are enrolled and marks are entered." action={<Button asChild><Link to="/import">Import students</Link></Button>} />
      ) : (
        <AnalyticsBody a={a!} group={group} setGroup={setGroup} term={term} setTerm={setTerm} />
      )}
    </div>
  );
}

function AnalyticsBody({ a, group, setGroup, term, setTerm }: { a: SectionAnalytics; group: Group; setGroup: (g: Group) => void; term: Term; setTerm: (t: Term) => void }) {
  const termData = a.termAverages.map((t) => ({ term: t.label, average: t.average }));
  const dist = a.distribution.map((d) => ({ range: d.label, students: d.count }));
  const termPerf = a.assessmentPerformance.find((t) => t.term === term);
  const categoryData = (termPerf?.categories ?? []).map((c) => ({ category: c.name.replace('Learning Materials and Notebook', 'Materials & Notebook').replace('Homeworks and Assignments', 'Homework'), percent: c.average === null ? null : Math.round((c.average / c.maxMarks) * 1000) / 10 }));
  const sectionData = a.sectionAverages.filter((s) => s.average !== null).map((s) => ({ section: s.label, average: s.average }));
  const noResults = a.totals.withResults === 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students" value={a.totals.students} hint={a.totals.withoutResults ? `${a.totals.withoutResults} without a complete result` : 'All have results'} />
        <StatCard label="Section average" value={fmtPercent(a.sectionAverage.average)} hint={a.sectionAverage.highest === null ? 'No complete results yet' : `Range ${fmtPercent(a.sectionAverage.lowest)} – ${fmtPercent(a.sectionAverage.highest)}`} />
        <StatCard label="Class average" value={fmtPercent(a.classAverage.average)} hint={`Sections ${a.classAverage.sections.join(', ')}`} />
        <StatCard label="Highest · Lowest" value={<span className="text-base">{a.highestStudent ? a.highestStudent.fullName : '—'}</span>} hint={a.lowestStudent ? `Lowest: ${a.lowestStudent.fullName} (${fmtPercent(a.lowestStudent.index)})` : undefined} />
      </div>

      {noResults && <p className="rounded-lg border border-dashed p-4 text-center text-[13px] text-muted-foreground">No student has a complete result yet, so averages, rankings and charts are empty. Enter marks on the Assessments and Examinations pages.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Average by term</CardTitle><CardDescription>Mean of each student’s term average</CardDescription></CardHeader>
          <CardContent>{hasValues(termData, ['average']) ? <BarChartView data={termData} xKey="term" series={[{ key: 'average', name: 'Average' }]} yMax={100} unit="%" ariaLabel="Bar chart of the section average by term" /> : <p className="py-10 text-center text-[13px] text-muted-foreground">No term has complete results yet.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Distribution of performance index</CardTitle><CardDescription>Number of students per percentage band (students with results only)</CardDescription></CardHeader>
          <CardContent>{a.distribution.some((d) => d.count > 0) ? <BarChartView data={dist} xKey="range" series={[{ key: 'students', name: 'Students' }]} ariaLabel="Bar chart of how many students fall in each percentage band" /> : <p className="py-10 text-center text-[13px] text-muted-foreground">Appears once students have complete results.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div className="space-y-1"><CardTitle>Assessment categories</CardTitle><CardDescription>Average as a percentage of each category’s maximum</CardDescription></div>
            <Select value={String(term)} onValueChange={(v) => setTerm(Number(v) as Term)}>
              <SelectTrigger size="sm" aria-label="Term" className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={String(t)}>{TERM_LABELS[t]}</SelectItem>)}</SelectContent>
            </Select>
          </CardHeader>
          <CardContent>{hasValues(categoryData, ['percent']) ? <BarChartView data={categoryData} xKey="category" series={[{ key: 'percent', name: 'Average' }]} yMax={100} unit="%" ariaLabel="Bar chart of average score per assessment category" /> : <p className="py-10 text-center text-[13px] text-muted-foreground">No assessment marks entered for {TERM_LABELS[term]}.</p>}
            {termPerf && <p className="mt-2 text-xs text-muted-foreground">{termPerf.entered} of {termPerf.enrolled} complete · {termPerf.finalized} finalized · {termPerf.missing} missing{termPerf.averageTotal !== null && ` · average ${fmtMarks(termPerf.averageTotal)}/${termPerf.maxTotal}`}</p>}
          </CardContent>
        </Card>
        {sectionData.length > 1 && (
          <Card>
            <CardHeader><CardTitle>Sections of this class compared</CardTitle><CardDescription>Average performance index</CardDescription></CardHeader>
            <CardContent><BarChartView data={sectionData} xKey="section" series={[{ key: 'average', name: 'Average' }]} yMax={100} unit="%" ariaLabel="Bar chart comparing sections" /></CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Examinations</CardTitle><CardDescription>Each percentage uses that examination’s own maximum.</CardDescription></CardHeader>
        <CardContent className="px-0 pb-2">
          {a.examPerformance.length === 0 ? <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">No examinations created for this section yet.</p> : (
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent"><TableHead>Examination</TableHead><TableHead>Term</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Max</TableHead><TableHead className="text-right">Entered</TableHead><TableHead className="text-right">Average</TableHead><TableHead className="text-right">High</TableHead><TableHead className="text-right">Low</TableHead></TableRow></TableHeader>
              <TableBody>
                {a.examPerformance.map((x) => (
                  <TableRow key={x.examId}>
                    <TableCell className="font-medium"><Link to={`/examinations/${x.examId}`} className="hover:underline">{x.name}</Link></TableCell>
                    <TableCell>{x.termLabel}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(x.examDate)}</TableCell>
                    <TableCell className="tabular text-right">{fmtMarks(x.maxMarks)}</TableCell>
                    <TableCell className="tabular text-right">{x.entered + x.finalized === x.enrolled ? x.enrolled : `${x.entered + x.finalized}/${x.enrolled}`}</TableCell>
                    <TableCell className="tabular text-right">{x.average === null ? '—' : `${fmtMarks(x.average)} (${fmtPercent(x.averagePercent, 0)})`}</TableCell>
                    <TableCell className="tabular text-right">{fmtMarks(x.highest)}</TableCell>
                    <TableCell className="tabular text-right">{fmtMarks(x.lowest)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monitoring</CardTitle>
          <CardDescription>{GROUPS.find((g) => g.key === group)?.hint}. Thresholds: exceptional ≥ {a.basis.thresholds.exceptionalMin}%, low &lt; {a.basis.thresholds.lowBelow}%, support &lt; {a.basis.thresholds.supportBelow}%, trend change of {a.basis.thresholds.trendBand}+ points.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-0 pb-2">
          <div className="px-4">
            <Tabs value={group} onValueChange={(v) => setGroup(v as Group)}>
              <TabsList className="h-auto flex-wrap">
                {GROUPS.map((g) => (
                  <TabsTrigger key={g.key} value={g.key}>{g.label}<Badge variant="muted" className="tabular">{a.attention[g.key].length}</Badge></TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <PeopleTable people={a.attention[group]} empty="No students in this group." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Ranking</CardTitle><CardDescription>By performance index. A monitoring aid, not a final grade. <Link to="/rankings" className="text-primary hover:underline">More rankings</Link></CardDescription></CardHeader>
        <CardContent className="px-0 pb-2">
          <PeopleTable people={a.ranking} empty="No student has a complete result yet." />
          {a.unranked.length > 0 && <p className="px-4 pt-3 text-xs text-muted-foreground">{plural(a.unranked.length, 'student')} without a complete result {a.unranked.length === 1 ? 'is' : 'are'} not ranked: {a.unranked.slice(0, 6).map((u) => u.fullName).join(', ')}{a.unranked.length > 6 ? '…' : ''}.</p>}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">{a.basis.description}</p>
    </div>
  );
}
