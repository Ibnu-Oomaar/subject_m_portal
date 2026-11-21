import { markProblem, parseMark } from './format';
import type { AssessmentCategory, AssessmentField, AssessmentSheetRow } from './types';

/** What a person has typed but not saved, per student: raw text per category (only cells that differ from the server). */
export type RowDraft = Partial<Record<AssessmentField, string>>;
export type Drafts = Record<string, RowDraft>;
export type Bases = Record<string, number>;

export const asText = (v: number | null): string => (v === null ? '' : String(v));

/** Applies one edit. A cell that returns to its saved value stops being a draft; an empty result removes the row's draft. */
export function applyEdit(draft: RowDraft | undefined, field: AssessmentField, text: string, serverValue: number | null): RowDraft | undefined {
  const next: RowDraft = { ...draft };
  if (parseMark(text) === serverValue) delete next[field]; // NaN (invalid text) never equals a saved value, so it stays a draft
  else next[field] = text;
  return Object.keys(next).length ? next : undefined;
}

export const cellText = (row: AssessmentSheetRow, field: AssessmentField, draft?: RowDraft): string => draft?.[field] ?? asText(row.scores[field]);

export interface LiveTotals {
  total: number | null;
  percent: number | null;
  filled: number;
  invalid: boolean;
}
/** Total and percentage from what is currently typed. The percentage exists only when all categories are filled and valid. */
export function liveTotals(row: AssessmentSheetRow, draft: RowDraft | undefined, categories: AssessmentCategory[], maxTotal: number): LiveTotals {
  let hundredths = 0;
  let filled = 0;
  let invalid = false;
  for (const c of categories) {
    const text = cellText(row, c.field, draft);
    const value = parseMark(text);
    if (value === null) continue;
    if (markProblem(text, c.maxMarks)) {
      invalid = true;
      continue;
    }
    hundredths += Math.round(value * 100);
    filled++;
  }
  const total = filled ? hundredths / 100 : null;
  const complete = filled === categories.length && !invalid;
  return { total, percent: complete && total !== null ? Math.round((total / maxTotal) * 10000) / 100 : null, filled, invalid };
}

/** How many typed cells are not acceptable (not a number, above the maximum, too many decimals). */
export function countProblems(drafts: Drafts, categories: AssessmentCategory[]): number {
  let n = 0;
  for (const draft of Object.values(drafts)) for (const c of categories) if (draft[c.field] !== undefined && markProblem(draft[c.field]!, c.maxMarks)) n++;
  return n;
}

export type SaveEntry = { enrollmentId: string; version: number } & Partial<Record<AssessmentField, number | null>>;
/** The request body entries: only changed categories are sent (null clears a mark, 0 is a real mark). */
export function buildEntries(drafts: Drafts, bases: Bases): SaveEntry[] {
  return Object.entries(drafts).map(([enrollmentId, draft]) => {
    const entry: SaveEntry = { enrollmentId, version: bases[enrollmentId] ?? 0 };
    for (const [field, text] of Object.entries(draft) as Array<[AssessmentField, string]>) entry[field] = parseMark(text);
    return entry;
  });
}
