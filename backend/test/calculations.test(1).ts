import { describe, expect, test } from 'bun:test';
import { ASSESSMENT_CATEGORIES, ASSESSMENT_MAX_TOTAL } from '../src/assessments/assessment-categories';
import {
  assessmentState,
  assessmentTotal,
  classify,
  distribution,
  emptyScores,
  mean,
  percentOf,
  rankDescending,
  summarize,
  trendOf,
  type AssessmentScores,
} from '../src/results/calculations';
import { computeStudentResults, type ScopeData } from '../src/results/student-results';

const scores = (p: Partial<AssessmentScores>): AssessmentScores => ({ ...emptyScores(), ...p });

describe('fixed assessment structure', () => {
  test('categories are 9 + 6 + 10 + 5 = 30', () => {
    expect(ASSESSMENT_CATEGORIES.map((c) => c.maxMarks)).toEqual([9, 6, 10, 5]);
    expect(ASSESSMENT_MAX_TOTAL).toBe(30);
  });
});

describe('assessment totals and states', () => {
  test('a complete record totals out of 30', () => {
    const s = scores({ classActivities: 9, homeworkAssignments: 6, learningMaterialsNotebook: 10, textbook: 5 });
    expect(assessmentTotal(s)).toBe(30);
    expect(assessmentState(s, false)).toBe('entered');
    expect(assessmentState(s, true)).toBe('finalized');
  });
  test('nothing entered is missing and has NO total (never zero)', () => {
    expect(assessmentTotal(emptyScores())).toBeNull();
    expect(assessmentState(emptyScores(), false)).toBe('missing');
  });
  test('an explicit zero is a real mark, not missing', () => {
    const s = scores({ classActivities: 0, homeworkAssignments: 0, learningMaterialsNotebook: 0, textbook: 0 });
    expect(assessmentTotal(s)).toBe(0);
    expect(assessmentState(s, false)).toBe('entered');
  });
  test('some categories entered is partial', () => {
    expect(assessmentState(scores({ classActivities: 7 }), false)).toBe('partial');
  });
  test('decimal marks add without floating point drift', () => {
    const s = scores({ classActivities: 0.1, homeworkAssignments: 0.2, learningMaterialsNotebook: 7.35, textbook: 4.1 });
    expect(assessmentTotal(s)).toBe(11.75);
  });
});

describe('percentages and averages', () => {
  test('percentages use the exam-specific maximum', () => {
    expect(percentOf(25, 50)).toBe(50);
    expect(percentOf(45, 60)).toBe(75);
    expect(percentOf(87, 100)).toBe(87);
    expect(percentOf(17.5, 30)).toBe(58.33);
  });
  test('mean rounds to 2 decimals and ignores nothing it is given', () => {
    expect(mean([80, 90, 85.5])).toBe(85.17);
    expect(mean([])).toBeNull();
  });
  test('summarize returns count, average, highest and lowest', () => {
    expect(summarize([50, 70, 90])).toEqual({ count: 3, average: 70, highest: 90, lowest: 50 });
    expect(summarize([])).toEqual({ count: 0, average: null, highest: null, lowest: null });
  });
});

describe('ranking', () => {
  test('ties share a rank and the next rank is skipped (1,2,2,4)', () => {
    const ranked = rankDescending([{ n: 'a', v: 90 }, { n: 'b', v: 80 }, { n: 'c', v: 80 }, { n: 'd', v: 70 }], (x) => x.v);
    expect(ranked.map((r) => [r.item.n, r.rank])).toEqual([['a', 1], ['b', 2], ['c', 2], ['d', 4]]);
  });
  test('values equal after rounding to hundredths tie', () => {
    const ranked = rankDescending([{ v: 58.33 }, { v: 58.330000001 }], (x) => x.v);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1]);
  });
});

describe('trend and classification', () => {
  test('improving, declining, steady and insufficient', () => {
    expect(trendOf([{ term: 1, index: 50 }, { term: 2, index: 60 }])).toEqual({ trend: 'improving', delta: 10 });
    expect(trendOf([{ term: 1, index: 70 }, { term: 2, index: 62 }])).toEqual({ trend: 'declining', delta: -8 });
    expect(trendOf([{ term: 1, index: 70 }, { term: 2, index: 72 }]).trend).toBe('steady');
    expect(trendOf([{ term: 1, index: 70 }, { term: 2, index: null }]).trend).toBe('insufficient');
  });
  test('trend skips a term with no data instead of treating it as zero', () => {
    expect(trendOf([{ term: 1, index: 60 }, { term: 2, index: null }, { term: 3, index: 72 }])).toEqual({ trend: 'improving', delta: 12 });
  });
  test('flags', () => {
    expect(classify(90, 'steady').exceptional).toBe(true);
    expect(classify(45, 'steady')).toMatchObject({ low: true, needsSupport: false });
    expect(classify(35, 'steady').needsSupport).toBe(true);
    expect(classify(55, 'declining')).toMatchObject({ declining: true, needsSupport: true });
    expect(classify(null, 'insufficient')).toEqual({ exceptional: false, low: false, needsSupport: false, improving: false, declining: false });
  });
  test('distribution buckets cover 0-100', () => {
    const d = distribution([10, 45, 55, 65, 75, 85, 95, 100, 39.99, 40]);
    expect(d.reduce((s, b) => s + b.count, 0)).toBe(10);
    expect(d.find((b) => b.label === '90-100')?.count).toBe(2);
    expect(d.find((b) => b.label === '40-49')?.count).toBe(2);
  });
});

describe('student results (assessment and exams kept separate, missing never zero)', () => {
  const base: ScopeData = {
    enrollments: [
      { enrollmentId: 'e1', studentUuid: 's1', studentId: 'S1', fullName: 'One', sectionId: 'B', sectionLabel: '1B' },
      { enrollmentId: 'e2', studentUuid: 's2', studentId: 'S2', fullName: 'Two', sectionId: 'B', sectionLabel: '1B' },
    ],
    assessments: [
      { enrollmentId: 'e1', term: 1, status: 'finalized', scores: scores({ classActivities: 9, homeworkAssignments: 6, learningMaterialsNotebook: 10, textbook: 5 }) },
      { enrollmentId: 'e2', term: 1, status: 'entered', scores: scores({ classActivities: 4 }) },
    ],
    exams: [
      { examId: 'x1', sectionId: 'B', term: 1, name: 'Term 1 Exam', maxMarks: 50, examDate: null },
      { examId: 'x2', sectionId: 'B', term: 2, name: 'Term 2 Exam', maxMarks: 60, examDate: null },
    ],
    examMarks: [
      { examId: 'x1', enrollmentId: 'e1', marks: 40, status: 'finalized' },
      { examId: 'x2', enrollmentId: 'e1', marks: 54, status: 'entered' },
    ],
  };
  const [r1, r2] = computeStudentResults(base);

  test('each component is judged against its own maximum', () => {
    const t1 = r1!.terms[0]!;
    expect(t1.components.map((c) => [c.kind, c.marks, c.max, c.percent])).toEqual([
      ['assessment', 30, 30, 100],
      ['exam', 40, 50, 80],
    ]);
    expect(r1!.terms[1]!.components.find((c) => c.kind === 'exam')).toMatchObject({ marks: 54, max: 60, percent: 90, state: 'entered' });
  });
  test('term index is the mean of that term, overall the mean of term indexes', () => {
    expect(r1!.terms.map((t) => t.index)).toEqual([90, 90, null]); // T1 (100+80)/2, T2 exam only (assessment missing), T3 nothing
    expect(r1!.overallIndex).toBe(90);
  });
  test('a student with only a partial assessment and no exam marks has no index', () => {
    expect(r2!.terms[0]!.components[0]).toMatchObject({ state: 'partial', percent: null, marks: 4 });
    expect(r2!.terms[0]!.components[1]).toMatchObject({ state: 'missing', marks: null, percent: null });
    expect(r2!.overallIndex).toBeNull();
    expect(r2!.flags.low).toBe(false); // unknown is not "low"
  });
  test('exams of another section are never attached to a student', () => {
    const other = computeStudentResults({ ...base, exams: [{ ...base.exams[0]!, examId: 'x9', sectionId: 'C' }], examMarks: [] });
    expect(other[0]!.terms[0]!.components.filter((c) => c.kind === 'exam')).toHaveLength(0);
  });
});
