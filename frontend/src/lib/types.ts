// Response types of the backend API (checked against live responses).

export type Role = 'teacher' | 'student';
export type Term = 1 | 2 | 3;
export type ResultState = 'missing' | 'partial' | 'entered' | 'finalized';
export type YearStatus = 'planned' | 'active' | 'closed';
export type Trend = 'improving' | 'declining' | 'steady' | 'insufficient';

export type Session =
  | { role: 'teacher'; user: { id: string; name: string }; csrfToken: string }
  | { role: 'student'; user: { id: string; studentId: string; fullName: string }; csrfToken: string };

export interface SectionRef {
  id: string;
  code: string;
  label: string;
  classId: string;
}
export interface ClassWithSections {
  id: string;
  gradeLevel: number;
  name: string;
  sections: SectionRef[];
}
export interface TeacherMe {
  id: string;
  name: string;
  hasPasscode: boolean;
  sections: SectionRef[];
}

export interface AcademicYear {
  id: string;
  label: string;
  startYear: number;
  status: YearStatus;
  createdAt: string;
  studentCount: number;
}
export interface YearSummary {
  id: string;
  label: string;
  status: YearStatus;
  sections: Array<{ sectionId: string; label: string; students: number; examinations: number; assessmentRecords: number; assessmentRecordsFinalized: number }>;
}
export interface YearRef {
  id: string;
  label: string;
  status: YearStatus;
}

export interface StudentRow {
  enrollmentId: string;
  studentUuid: string;
  studentId: string;
  fullName: string;
  sectionId: string;
  sectionLabel: string;
  classId: string;
}
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---- assessments -------------------------------------------------------------------------------------------------
export type AssessmentField = 'classActivities' | 'homeworkAssignments' | 'learningMaterialsNotebook' | 'textbook';
export type Scores = Record<AssessmentField, number | null>;
export interface AssessmentCategory {
  code: string;
  field: AssessmentField;
  name: string;
  maxMarks: number;
}
export interface AssessmentSheetRow {
  enrollmentId: string;
  studentId: string;
  fullName: string;
  scores: Scores;
  total: number | null;
  percent: number | null;
  state: ResultState;
  version: number;
  recordId: string | null;
  updatedAt: string | null;
}
export interface AssessmentSheet {
  academicYear: YearRef;
  section: { id: string; label: string };
  term: Term;
  termLabel: string;
  locked: boolean;
  maxTotal: number;
  categories: AssessmentCategory[];
  summary: { students: number; missing: number; partial: number; entered: number; finalized: number };
  rows: AssessmentSheetRow[];
}
export interface SaveResult {
  created: number;
  updated: number;
  corrected: number;
  cleared: number;
  unchanged: number;
  records: Array<{ enrollmentId: string; id: string; version: number; status: 'entered' | 'finalized' }>;
}
export interface FinalizeResult {
  finalized: number;
  alreadyFinalized: number;
  incomplete: number;
  missing: number;
}
export interface HistoryItem {
  id: string;
  action: string;
  at: string;
  actorName: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
}

// ---- examinations ------------------------------------------------------------------------------------------------
export interface Examination {
  id: string;
  academicYearId: string;
  sectionId: string;
  sectionLabel: string;
  term: Term;
  termLabel: string;
  name: string;
  maxMarks: number;
  examDate: string | null;
  enrolled: number;
  entered: number;
  finalized: number;
  missing: number;
  state: ResultState;
}
export interface ExamSheetRow {
  enrollmentId: string;
  studentId: string;
  fullName: string;
  marks: number | null;
  percent: number | null;
  state: ResultState;
  version: number;
  recordId: string | null;
  updatedAt: string | null;
}
export interface ExamSheet {
  examination: Examination;
  academicYear: YearRef;
  locked: boolean;
  summary: { students: number; missing: number; entered: number; finalized: number; count: number; average: number | null; highest: number | null; lowest: number | null; averagePercent: number | null };
  rows: ExamSheetRow[];
}

// ---- results / analytics -----------------------------------------------------------------------------------------
export interface Flags {
  exceptional: boolean;
  low: boolean;
  needsSupport: boolean;
  improving: boolean;
  declining: boolean;
}
export interface Thresholds {
  exceptionalMin: number;
  lowBelow: number;
  supportBelow: number;
  decliningSupportBelow: number;
  trendBand: number;
}
export interface Basis {
  description: string;
  thresholds: Thresholds;
}
export interface ResultComponent {
  kind: 'assessment' | 'exam';
  term: Term;
  label: string;
  examId: string | null;
  examDate: string | null;
  marks: number | null;
  max: number;
  percent: number | null;
  state: ResultState;
  scores: Scores | null;
}
export interface TermResult {
  term: Term;
  label: string;
  components: ResultComponent[];
  index: number | null;
}
export interface StudentProfile {
  student: { enrollmentId: string; studentId: string; fullName: string };
  academicYear: YearRef;
  section: { id: string; label: string };
  className: string;
  terms: TermResult[];
  overallIndex: number | null;
  trend: Trend;
  trendDelta: number | null;
  flags?: Flags;
  progress: Array<{ term: Term; label: string; index: number | null }>;
  history: Array<{
    enrollmentId: string;
    academicYearId: string;
    academicYearLabel: string;
    sectionLabel: string;
    overallIndex: number | null;
    termIndexes: Array<{ term: Term; index: number | null }>;
  }>;
  basis?: Basis;
}
export interface StudentYear {
  academicYearId: string;
  academicYearLabel: string;
  status: YearStatus;
  sectionLabel: string;
}

export interface PersonRef {
  enrollmentId: string;
  studentId: string;
  fullName: string;
  sectionLabel: string;
  index: number | null;
  trend: Trend;
  trendDelta: number | null;
}
export interface Dashboard {
  academicYear: YearRef | null;
  empty?: boolean;
  totals: { students: number; sections: number; sectionsWithStudents?: number };
  assessmentCompletion?: { expected: number; entered: number; percent: number | null; byTerm: Array<{ term: Term; label: string; expected: number; entered: number; finalized: number; percent: number | null }> };
  examCompletion?: { examinations: number; expected: number; entered: number; percent: number | null; byTerm: Array<{ term: Term; label: string; exams: number; expected: number; entered: number; percent: number | null }> };
  sections?: Array<{ sectionId: string; label: string; students: number; averageIndex: number | null; assessmentPercent: number | null; examPercent: number | null; examinations: number }>;
  topStudents?: Array<PersonRef & { rank: number }>;
  attention?: Array<PersonRef & { needsSupport: boolean; declining: boolean }>;
  counts?: { exceptional: number; low: number; needsSupport: number; improving: number; declining: number };
  thresholds?: Thresholds;
  recentActivity?: Array<{ batchId: string | null; action: string; entityType: string; count: number; at: string; context: Record<string, unknown> | null; actorName: string | null }>;
}
export interface SectionAnalytics {
  academicYear: YearRef;
  section: { id: string; label: string };
  totals: { students: number; withResults: number; withoutResults: number };
  sectionAverage: { average: number | null; highest: number | null; lowest: number | null; students: number };
  classAverage: { average: number | null; students: number; sections: string[] };
  sectionAverages: Array<{ sectionId: string; label: string; average: number | null; students: number }>;
  highestStudent: PersonRef | null;
  lowestStudent: PersonRef | null;
  ranking: Array<PersonRef & { rank: number }>;
  unranked: PersonRef[];
  assessmentPerformance: Array<{
    term: Term;
    label: string;
    enrolled: number;
    entered: number;
    finalized: number;
    missing: number;
    maxTotal: number;
    averageTotal: number | null;
    highestTotal: number | null;
    lowestTotal: number | null;
    averagePercent: number | null;
    categories: Array<{ code: string; name: string; maxMarks: number; average: number | null }>;
  }>;
  examPerformance: Array<{
    examId: string;
    name: string;
    term: Term;
    termLabel: string;
    examDate: string | null;
    maxMarks: number;
    enrolled: number;
    entered: number;
    finalized: number;
    missing: number;
    average: number | null;
    averagePercent: number | null;
    highest: number | null;
    lowest: number | null;
  }>;
  termAverages: Array<{ term: Term; label: string; average: number | null; students: number }>;
  distribution: Array<{ label: string; count: number }>;
  attention: { exceptional: PersonRef[]; low: PersonRef[]; needsSupport: PersonRef[]; improving: PersonRef[]; declining: PersonRef[] };
  basis: Basis;
}
export interface Ranking {
  kind: 'index' | 'assessment' | 'exam';
  scope: 'section' | 'class';
  title: string;
  context: string;
  sections: string[];
  items: Array<{ rank: number; enrollmentId: string; studentId: string; fullName: string; sectionLabel: string; marks: number | null; max: number | null; percent: number }>;
  unranked: Array<{ enrollmentId: string; studentId: string; fullName: string; sectionLabel: string }>;
}

// ---- import ------------------------------------------------------------------------------------------------------
export interface ImportIssue {
  severity: 'error' | 'warning';
  code: string;
  field?: string;
  message: string;
}
export interface ImportPreviewRow {
  rowNumber: number;
  studentId: string;
  fullName: string;
  className: string | null;
  sectionLabel: string | null;
  status: 'new' | 'returning' | 'error';
  issues: ImportIssue[];
}
export interface ImportPreview {
  token: string;
  expiresInSeconds: number;
  academicYear: { id: string; label: string };
  fileName: string;
  columns: { recognised: Record<string, string>; ignored: string[]; academicYearColumnPresent: boolean };
  summary: { totalRows: number; importable: number; new: number; returning: number; withErrors: number; withWarnings: number; bySection: Array<{ label: string; count: number }> };
  rows: ImportPreviewRow[];
  truncated: boolean;
}
export interface ImportResult {
  enrolled: number;
  newStudents: number;
  returningStudents: number;
  skippedRows: number;
}
