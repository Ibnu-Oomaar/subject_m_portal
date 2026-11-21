import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import type { ResultState, Term, Trend } from './types';

export const TERM_LABELS: Record<Term, string> = { 1: 'Term 1', 2: 'Term 2', 3: 'Final Term 3' };
export const TERMS: readonly Term[] = [1, 2, 3];

export const STATE_LABELS: Record<ResultState, string> = { missing: 'Missing', partial: 'Partial', entered: 'Entered', finalized: 'Finalized' };
export const TREND_LABELS: Record<Trend, string> = { improving: 'Improving', declining: 'Declining', steady: 'Steady', insufficient: 'Not enough data' };

/** Marks are shown with at most two decimals and no trailing zeros; absent marks are an em dash, never "0". */
export function fmtMarks(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return String(Math.round(value * 100) / 100);
}
export function fmtPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return '—';
  return `${(Math.round(value * 10 ** digits) / 10 ** digits).toFixed(digits).replace(/\.0+$/, '')}%`;
}
export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return format(parseISO(value), 'd MMM yyyy');
  } catch {
    return value;
  }
}
export function fmtDateTime(value: string): string {
  try {
    return format(parseISO(value), 'd MMM yyyy, HH:mm');
  } catch {
    return value;
  }
}
export function fmtAgo(value: string): string {
  try {
    return `${formatDistanceToNowStrict(parseISO(value))} ago`;
  } catch {
    return value;
  }
}
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Parses what a person typed into a mark cell. Returns null for blank, NaN for text that is not a number. */
export function parseMark(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (text === '') return null;
  if (!/^\d+(\.\d+)?$/.test(text)) return Number.NaN;
  return Number(text);
}
/** Validation message for one typed mark, or null when it is acceptable. */
export function markProblem(raw: string, max: number): string | null {
  const value = parseMark(raw);
  if (value === null) return null;
  if (Number.isNaN(value)) return 'Enter a number';
  if (value > max) return `Maximum is ${fmtMarks(max)}`;
  if (Math.round(value * 100) / 100 !== value) return 'Use at most 2 decimals';
  return null;
}
