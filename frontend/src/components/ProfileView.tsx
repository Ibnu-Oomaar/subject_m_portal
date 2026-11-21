import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, StateBadge, StatCard } from '@/components/common';
import { hasValues, LineChartView } from '@/components/charts/Charts';
import { fmtDate, fmtMarks, fmtPercent, TREND_LABELS } from '@/lib/format';
import type { Flags, StudentProfile } from '@/lib/types';
import { LineChart as LineChartIcon } from 'lucide-react';

const FLAG_BADGES: Array<[keyof Flags, string, 'success' | 'destructive' | 'warning' | 'info']> = [
  ['exceptional', 'Performing exceptionally well', 'success'],
  ['low', 'Low academic performance', 'destructive'],
  ['needsSupport', 'Requires additional support', 'destructive'],
  ['improving', 'Improving', 'info'],
  ['declining', 'Declining', 'warning'],
];

/** Read-only presentation of one student's results in one academic year. Used by the teacher and by the student's own dashboard. */
export function ProfileView({ profile, showFlags }: { profile: StudentProfile; showFlags: boolean }) {
  const chart = profile.progress.map((p) => ({ term: p.label, index: p.index }));
  const activeFlags = showFlags && profile.flags ? FLAG_BADGES.filter(([k]) => profile.flags![k]) : [];
  const anyResult = profile.terms.some((t) => t.components.some((c) => c.state === 'entered' || c.state === 'finalized'));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Performance index" value={fmtPercent(profile.overallIndex)} hint="Average of term averages" />
        <StatCard label="Trend" value={<span className="text-base">{TREND_LABELS[profile.trend]}</span>} hint={profile.trendDelta === null ? 'Needs two terms with results' : `${profile.trendDelta > 0 ? '+' : ''}${profile.trendDelta} points since last term`} />
        <StatCard label="Class" value={<span className="text-base">{profile.className} · {profile.section.label}</span>} hint={profile.academicYear.label} />
        <StatCard label="Student ID" value={<span className="tabular text-base">{profile.student.studentId}</span>} />
      </div>

      {activeFlags.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Monitoring flags">
          {activeFlags.map(([k, label, variant]) => <Badge key={k} variant={variant}>{label}</Badge>)}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Progress by term</CardTitle>
          <CardDescription>Average percentage of the complete results in each term. A term with no results is left blank, not drawn as zero.</CardDescription>
        </CardHeader>
        <CardContent>
          {hasValues(chart, ['index']) ? (
            <LineChartView data={chart} xKey="term" series={[{ key: 'index', name: 'Term average' }]} unit="%" ariaLabel="Line chart of the term average percentage" />
          ) : (
            <EmptyState icon={LineChartIcon} title="No results to chart yet" description="The chart appears once marks have been entered for at least one term." />
          )}
        </CardContent>
      </Card>

      {profile.terms.map((t) => (
        <Card key={t.term}>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t.label}</CardTitle>
            <span className="text-xs text-muted-foreground">Term average <strong className="tabular text-foreground">{fmtPercent(t.index)}</strong></span>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Result</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Marks</TableHead>
                  <TableHead className="text-right">Out of</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {t.components.map((c) => {
                  const counted = c.state === 'entered' || c.state === 'finalized';
                  return (
                    <TableRow key={`${c.kind}-${c.examId ?? c.term}`}>
                      <TableCell className="font-medium">{c.label}</TableCell>
                      <TableCell className="text-muted-foreground">{fmtDate(c.examDate)}</TableCell>
                      <TableCell className="tabular text-right">{counted ? fmtMarks(c.marks) : '—'}</TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">{fmtMarks(c.max)}</TableCell>
                      <TableCell className="tabular text-right">{fmtPercent(c.percent)}</TableCell>
                      <TableCell><StateBadge state={c.state} /></TableCell>
                    </TableRow>
                  );
                })}
                {t.components
                  .filter((c) => c.kind === 'assessment' && c.scores && Object.values(c.scores).some((v) => v !== null))
                  .map((c) => (
                    <TableRow key={`cat-${c.term}`} className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={6} className="py-2 text-xs text-muted-foreground">
                        <span className="mr-2 font-medium text-foreground">Assessment categories</span>
                        {[['Class Activities', c.scores!.classActivities, 9], ['Homeworks and Assignments', c.scores!.homeworkAssignments, 6], ['Learning Materials and Notebook', c.scores!.learningMaterialsNotebook, 10], ['Textbook', c.scores!.textbook, 5]].map(([name, v, max]) => (
                          <span key={String(name)} className="mr-3 inline-block">
                            {name}: <strong className="tabular text-foreground">{fmtMarks(v as number | null)}</strong>/{max}
                          </span>
                        ))}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {!anyResult && <p className="text-center text-[13px] text-muted-foreground">No marks have been entered yet for {profile.academicYear.label}. Missing results are never shown as zero.</p>}

      {profile.history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Other academic years</CardTitle>
            <CardDescription>Earlier results are kept permanently.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Academic year</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead className="text-right">Term 1</TableHead>
                  <TableHead className="text-right">Term 2</TableHead>
                  <TableHead className="text-right">Final Term 3</TableHead>
                  <TableHead className="text-right">Index</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profile.history.map((h) => (
                  <TableRow key={h.enrollmentId}>
                    <TableCell className="font-medium">{h.academicYearLabel}</TableCell>
                    <TableCell>{h.sectionLabel}</TableCell>
                    {[1, 2, 3].map((n) => <TableCell key={n} className="tabular text-right">{fmtPercent(h.termIndexes.find((x) => x.term === n)?.index ?? null)}</TableCell>)}
                    <TableCell className="tabular text-right font-medium">{fmtPercent(h.overallIndex)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {profile.basis && <p className="text-xs text-muted-foreground">{profile.basis.description}</p>}
    </div>
  );
}

