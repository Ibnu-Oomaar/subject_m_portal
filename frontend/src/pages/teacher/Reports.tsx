import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, type LucideIcon, BarChart3, ClipboardList, FileText, Trophy, User, Users, CalendarDays } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWorkspace } from '@/hooks/useWorkspace';
import { api, errorMessage } from '@/lib/api';
import { TERM_LABELS, TERMS } from '@/lib/format';
import type { Examination, Paged, StudentRow } from '@/lib/types';

type Query = Record<string, string | number | undefined>;

function ReportCard({ icon: Icon, title, description, type, query, disabled, children }: { icon: LucideIcon; title: string; description: string; type: string; query: Query; disabled?: boolean; children?: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      toast.success(`Downloaded ${await api.download(`/exports/${type}`, query)}`);
    } catch (e) {
      toast.error('Could not create the file', { description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="gap-3 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4" /></div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {children && <div className="flex flex-wrap items-end gap-3">{children}</div>}
      <div className="mt-auto">
        <Button size="sm" variant="outline" loading={busy} disabled={disabled} onClick={() => void run()}><Download /> Download Excel</Button>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}
function Pick<T extends string>({ value, onChange, options, label, width = 'w-44' }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>; label: string; width?: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger size="sm" aria-label={label} className={width}><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export default function Reports() {
  const { yearId, sectionId, year, section } = useWorkspace();
  const [studentsScope, setStudentsScope] = useState<'section' | 'class' | 'all' | 'all-years'>('section');
  const [assessTerm, setAssessTerm] = useState<'all' | '1' | '2' | '3'>('all');
  const [assessScope, setAssessScope] = useState<'section' | 'class'>('section');
  const [examTerm, setExamTerm] = useState<'1' | '2' | '3'>('1');
  const [examScope, setExamScope] = useState<'section' | 'class'>('section');
  const [studentPick, setStudentPick] = useState('');
  const [rankKind, setRankKind] = useState<'index' | 'assessment' | 'exam'>('index');
  const [rankTerm, setRankTerm] = useState<'1' | '2' | '3'>('1');
  const [rankExam, setRankExam] = useState('');
  const [rankScope, setRankScope] = useState<'section' | 'class'>('section');
  const [yearScope, setYearScope] = useState<'section' | 'class' | 'all'>('all');

  const students = useQuery({ queryKey: ['students', 'picker', yearId, sectionId], queryFn: () => api.get<Paged<StudentRow>>('/students', { academicYearId: yearId, sectionId, pageSize: 100 }), enabled: !!yearId && !!sectionId });
  const exams = useQuery({ queryKey: ['examinations', 'list', yearId, sectionId, 'all'], queryFn: () => api.get<Examination[]>('/examinations', { academicYearId: yearId, sectionId }), enabled: !!yearId && !!sectionId });

  if (!yearId || !sectionId) return <EmptyState icon={FileSpreadsheet} title="Create an academic year first" description="Reports are generated per academic year." action={<Button asChild><Link to="/academic-years">Academic years</Link></Button>} />;
  const examList = exams.data ?? [];
  const pickedExam = examList.some((x) => x.id === rankExam) ? rankExam : (examList[0]?.id ?? '');
  const studentList = students.data?.items ?? [];
  const scopeOptions = [{ value: 'section' as const, label: `Section ${section?.label}` }, { value: 'class' as const, label: 'Whole class' }];

  const scopeQuery = (scope: 'section' | 'class' | 'all'): Query => (scope === 'all' ? {} : { sectionId, scope });

  return (
    <div>
      <PageHeader title="Reports and exports" description={`Excel files for ${year?.label}. Files only contain your own sections, show missing marks as blank cells (never zero), and use the exact maximum of each examination.`} />
      <div className="grid gap-4 md:grid-cols-2">
        <ReportCard icon={Users} title="Students" description="Student ID, name, class, section and academic year." type="students"
          query={studentsScope === 'all-years' ? {} : studentsScope === 'all' ? { academicYearId: yearId } : { academicYearId: yearId, sectionId, scope: studentsScope }}>
          <Field label="Which students"><Pick label="Which students" width="w-60" value={studentsScope} onChange={setStudentsScope} options={[{ value: 'section', label: `Section ${section?.label}` }, { value: 'class', label: 'Whole class (all my sections)' }, { value: 'all', label: `All students, ${year?.label}` }, { value: 'all-years', label: 'All students, every year' }]} /></Field>
        </ReportCard>

        <ReportCard icon={ClipboardList} title="Continuous assessment marks" description="The four categories, total out of 30, percentage and status, one sheet per term." type="assessments"
          query={{ academicYearId: yearId, ...scopeQuery(assessScope), term: assessTerm === 'all' ? undefined : assessTerm }}>
          <Field label="Term"><Pick label="Term" width="w-36" value={assessTerm} onChange={setAssessTerm} options={[{ value: 'all', label: 'All terms' }, ...TERMS.map((t) => ({ value: String(t) as '1' | '2' | '3', label: TERM_LABELS[t] }))]} /></Field>
          <Field label="Scope"><Pick label="Scope" value={assessScope} onChange={setAssessScope} options={scopeOptions} /></Field>
        </ReportCard>

        <ReportCard icon={FileText} title="Examination marks" description="One row per student per examination for a term, with each examination's maximum and percentage." type="exam-marks"
          query={{ academicYearId: yearId, ...scopeQuery(examScope), term: examTerm }}>
          <Field label="Term"><Pick label="Term" width="w-36" value={examTerm} onChange={setExamTerm} options={TERMS.map((t) => ({ value: String(t) as '1' | '2' | '3', label: TERM_LABELS[t] }))} /></Field>
          <Field label="Scope"><Pick label="Scope" value={examScope} onChange={setExamScope} options={scopeOptions} /></Field>
        </ReportCard>

        <ReportCard icon={User} title="Individual student result" description="Summary, all results, assessment categories, term averages and earlier years for one student." type="student-result" query={{ enrollmentId: studentPick }} disabled={!studentPick}>
          <Field label={`Student in Class ${section?.label}`}>
            <Select value={studentPick} onValueChange={setStudentPick} disabled={!studentList.length}>
              <SelectTrigger size="sm" aria-label="Student" className="w-64"><SelectValue placeholder={students.isPending ? 'Loading…' : studentList.length ? 'Choose a student' : 'No students'} /></SelectTrigger>
              <SelectContent>{studentList.map((s) => <SelectItem key={s.enrollmentId} value={s.enrollmentId}>{s.fullName} · {s.studentId}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </ReportCard>

        <ReportCard icon={Trophy} title="Rankings" description="Ranked students plus a separate list of students without a complete result." type="rankings"
          query={{ academicYearId: yearId, sectionId, scope: rankScope, kind: rankKind, term: rankKind === 'assessment' ? rankTerm : undefined, examId: rankKind === 'exam' ? pickedExam : undefined }} disabled={rankKind === 'exam' && !pickedExam}>
          <Field label="Based on"><Pick label="Ranking basis" width="w-44" value={rankKind} onChange={setRankKind} options={[{ value: 'index', label: 'Performance index' }, { value: 'assessment', label: 'Assessment' }, { value: 'exam', label: 'Examination' }]} /></Field>
          {rankKind === 'assessment' && <Field label="Term"><Pick label="Term" width="w-32" value={rankTerm} onChange={setRankTerm} options={TERMS.map((t) => ({ value: String(t) as '1' | '2' | '3', label: TERM_LABELS[t] }))} /></Field>}
          {rankKind === 'exam' && (
            <Field label="Examination">
              <Select value={pickedExam} onValueChange={setRankExam} disabled={!examList.length}>
                <SelectTrigger size="sm" aria-label="Examination" className="w-52"><SelectValue placeholder="No examinations" /></SelectTrigger>
                <SelectContent>{examList.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Scope"><Pick label="Scope" value={rankScope} onChange={setRankScope} options={scopeOptions} /></Field>
        </ReportCard>

        <ReportCard icon={CalendarDays} title="Academic year report" description="Overview, sections, every student's results and all examinations for the year." type="academic-year-report"
          query={{ academicYearId: yearId, ...scopeQuery(yearScope) }}>
          <Field label="Scope"><Pick label="Scope" width="w-52" value={yearScope} onChange={setYearScope} options={[{ value: 'all', label: 'All my sections' }, ...scopeOptions]} /></Field>
        </ReportCard>

        <ReportCard icon={BarChart3} title="Class performance" description="Statistics, ranking, assessment and examination performance, distribution and monitoring groups." type="class-performance" query={{ academicYearId: yearId, sectionId }} />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Exports follow the academic year and section chosen at the top of the page.</p>
    </div>
  );
}
