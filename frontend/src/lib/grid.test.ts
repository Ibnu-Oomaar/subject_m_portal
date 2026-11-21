import { describe, expect, test } from 'vitest';
import { applyEdit, buildEntries, cellText, countProblems, liveTotals, type Drafts } from './grid';
import type { AssessmentCategory, AssessmentSheetRow } from './types';

const categories: AssessmentCategory[] = [
  { code: 'CLASS_ACTIVITIES', field: 'classActivities', name: 'Class Activities', maxMarks: 9 },
  { code: 'HOMEWORK_ASSIGNMENTS', field: 'homeworkAssignments', name: 'Homeworks and Assignments', maxMarks: 6 },
  { code: 'LEARNING_MATERIALS_NOTEBOOK', field: 'learningMaterialsNotebook', name: 'Learning Materials and Notebook', maxMarks: 10 },
  { code: 'TEXTBOOK', field: 'textbook', name: 'Textbook', maxMarks: 5 },
];
const row = (scores: Partial<AssessmentSheetRow['scores']> = {}): AssessmentSheetRow => ({
  enrollmentId: 'e1', studentId: 'S1', fullName: 'Amina Ali', total: null, percent: null, state: 'missing', version: 3, recordId: null, updatedAt: null,
  scores: { classActivities: null, homeworkAssignments: null, learningMaterialsNotebook: null, textbook: null, ...scores },
});

describe('cellText', () => {
  test('shows the draft when there is one, otherwise the saved value, and blank for a missing mark', () => {
    const r = row({ classActivities: 7, textbook: 0 });
    expect(cellText(r, 'classActivities')).toBe('7');
    expect(cellText(r, 'classActivities', { classActivities: '8' })).toBe('8');
    expect(cellText(r, 'classActivities', { classActivities: '' })).toBe(''); // a deliberately cleared cell
    expect(cellText(r, 'textbook')).toBe('0'); // a real zero is shown as 0
    expect(cellText(r, 'homeworkAssignments')).toBe(''); // missing is blank, never 0
  });
});

describe('applyEdit', () => {
  test('typing a new value creates a draft', () => {
    expect(applyEdit(undefined, 'classActivities', '8', 7)).toEqual({ classActivities: '8' });
  });
  test('typing the saved value again removes the draft (nothing to save)', () => {
    expect(applyEdit({ classActivities: '8' }, 'classActivities', '7', 7)).toBeUndefined();
    expect(applyEdit({ classActivities: '8', textbook: '2' }, 'classActivities', '7.0', 7)).toEqual({ textbook: '2' });
  });
  test('clearing a saved mark is a draft; leaving a missing mark blank is not', () => {
    expect(applyEdit(undefined, 'classActivities', '', 7)).toEqual({ classActivities: '' });
    expect(applyEdit({ classActivities: '3' }, 'classActivities', '', null)).toBeUndefined();
  });
  test('0 differs from a missing mark', () => {
    expect(applyEdit(undefined, 'textbook', '0', null)).toEqual({ textbook: '0' });
  });
  test('invalid text stays a draft so the problem can be shown', () => {
    expect(applyEdit(undefined, 'textbook', 'abc', null)).toEqual({ textbook: 'abc' });
    expect(applyEdit(undefined, 'textbook', 'abc', 3)).toEqual({ textbook: 'abc' });
  });
  test('does not mutate the previous draft', () => {
    const before = { classActivities: '8' };
    applyEdit(before, 'textbook', '2', null);
    expect(before).toEqual({ classActivities: '8' });
  });
});

describe('liveTotals', () => {
  test('nothing filled: no total and no percentage (never 0)', () => {
    expect(liveTotals(row(), undefined, categories, 30)).toEqual({ total: null, percent: null, filled: 0, invalid: false });
  });
  test('partly filled: a running total, but no percentage', () => {
    const t = liveTotals(row({ classActivities: 9, homeworkAssignments: 6 }), undefined, categories, 30);
    expect(t).toEqual({ total: 15, percent: null, filled: 2, invalid: false });
  });
  test('all four filled: total out of 30 and percentage', () => {
    const t = liveTotals(row({ classActivities: 9, homeworkAssignments: 6, learningMaterialsNotebook: 10, textbook: 5 }), undefined, categories, 30);
    expect(t).toEqual({ total: 30, percent: 100, filled: 4, invalid: false });
  });
  test('uses typed drafts over saved values', () => {
    const t = liveTotals(row({ classActivities: 9, homeworkAssignments: 6, learningMaterialsNotebook: 10, textbook: 5 }), { textbook: '0', classActivities: '' }, categories, 30);
    expect(t).toMatchObject({ total: 16, filled: 3, percent: null }); // a cleared mark makes the result incomplete again
  });
  test('decimals add up without floating-point drift', () => {
    const t = liveTotals(row({ classActivities: 0.1, homeworkAssignments: 0.2, learningMaterialsNotebook: 0.3, textbook: 0.4 }), undefined, categories, 30);
    expect(t.total).toBe(1);
    expect(t.percent).toBe(3.33);
  });
  test('an invalid or too-large cell is flagged and excluded, and blocks the percentage', () => {
    const t = liveTotals(row({ classActivities: 5, homeworkAssignments: 3, learningMaterialsNotebook: 4 }), { textbook: '9' }, categories, 30);
    expect(t).toMatchObject({ total: 12, filled: 3, invalid: true, percent: null });
    expect(liveTotals(row(), { classActivities: 'x' }, categories, 30)).toMatchObject({ total: null, invalid: true });
  });
});

describe('countProblems', () => {
  test('counts only unacceptable typed cells', () => {
    const drafts: Drafts = { e1: { classActivities: '10', textbook: '2' }, e2: { homeworkAssignments: 'abc', learningMaterialsNotebook: '', textbook: '1.234' } };
    expect(countProblems(drafts, categories)).toBe(3);
    expect(countProblems({}, categories)).toBe(0);
  });
});

describe('buildEntries', () => {
  test('sends only changed fields, with the version the row had when editing began', () => {
    const entries = buildEntries({ e1: { classActivities: '8', textbook: '' }, e2: { homeworkAssignments: '0' } }, { e1: 4, e2: 0 });
    expect(entries).toEqual([
      { enrollmentId: 'e1', version: 4, classActivities: 8, textbook: null }, // blank clears the mark
      { enrollmentId: 'e2', version: 0, homeworkAssignments: 0 }, // 0 is a real mark
    ]);
    expect('homeworkAssignments' in entries[0]!).toBe(false);
  });
  test('a missing base defaults to version 0 (a row with no record yet)', () => {
    expect(buildEntries({ e9: { textbook: '3' } }, {})).toEqual([{ enrollmentId: 'e9', version: 0, textbook: 3 }]);
  });
});
