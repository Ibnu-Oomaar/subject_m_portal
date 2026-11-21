import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { Errors } from '../common/errors';

/**
 * File reading and cell normalisation for student imports. Kept free of database access so it can be tested with
 * plain buffers.
 */

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

export type ImportField = 'studentId' | 'fullName' | 'class' | 'section' | 'academicYear';

export const REQUIRED_FIELDS: ImportField[] = ['studentId', 'fullName', 'class', 'section'];
export const FIELD_LABELS: Record<ImportField, string> = {
  studentId: 'Student ID',
  fullName: 'Student Name',
  class: 'Class',
  section: 'Section',
  academicYear: 'Academic Year',
};

/** Accepted header spellings, compared after lower-casing and removing everything except letters and digits. */
const HEADER_ALIASES: Record<ImportField, string[]> = {
  studentId: ['studentid', 'id', 'studentnumber', 'studentno', 'admissionnumber', 'admissionno'],
  fullName: ['studentname', 'name', 'fullname', 'student', 'pupilname'],
  class: ['class', 'grade', 'classlevel', 'level'],
  section: ['section', 'stream', 'classsection'],
  academicYear: ['academicyear', 'year', 'schoolyear', 'session'],
};

const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

export interface RawRow {
  /** 1-based row number in the file (what the teacher sees in Excel) */
  rowNumber: number;
  values: Partial<Record<ImportField, string>>;
}

export interface ParsedFile {
  rows: RawRow[];
  /** headers found in the file that map to a known field */
  recognised: Partial<Record<ImportField, string>>;
  ignoredHeaders: string[];
}

/** xlsx files are ZIP archives; a renamed .exe or .pdf must not get through just because of its extension. */
export function detectFormat(fileName: string, buffer: Buffer): 'xlsx' | 'csv' {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx')) {
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw Errors.badRequest('This file is not a valid Excel (.xlsx) workbook.', undefined, 'INVALID_FILE');
    }
    return 'xlsx';
  }
  if (lower.endsWith('.csv')) {
    if (buffer.includes(0)) throw Errors.badRequest('This file is not a valid CSV text file.', undefined, 'INVALID_FILE');
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      throw Errors.badRequest('The CSV file must be saved as UTF-8.', undefined, 'INVALID_FILE');
    }
    return 'csv';
  }
  throw Errors.badRequest('Upload an Excel (.xlsx) or CSV (.csv) file.', undefined, 'INVALID_FILE');
}

/** Turns whatever ExcelJS hands back for a cell (text, number, rich text, formula result, hyperlink) into plain text. */
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.normalize('NFKC').replace(/^﻿/, '').trim().replace(/\s+/g, ' ');
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const v = value as unknown as Record<string, unknown>;
    if (Array.isArray(v.richText)) return cellText((v.richText as Array<{ text: string }>).map((t) => t.text).join(''));
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
    if ('text' in v) return cellText(v.text as ExcelJS.CellValue);
    if ('error' in v) return '';
  }
  return '';
}

export async function parseStudentFile(fileName: string, buffer: Buffer): Promise<ParsedFile> {
  const format = detectFormat(fileName, buffer);
  const wb = new ExcelJS.Workbook();
  let ws: ExcelJS.Worksheet | undefined;
  try {
    if (format === 'xlsx') {
      await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
      ws = wb.worksheets.find((s) => s.rowCount > 0);
    } else {
      // `map` disables ExcelJS's automatic number/date conversion so IDs like 007 or 01-02 stay exactly as typed
      ws = await wb.csv.read(Readable.from(buffer), { map: (v: unknown) => v, parserOptions: { delimiter: ',' } } as never);
    }
  } catch {
    throw Errors.badRequest('The file could not be read. Check that it is a valid Excel or CSV file.', undefined, 'INVALID_FILE');
  }
  if (!ws || ws.rowCount === 0) throw Errors.badRequest('The file is empty.', undefined, 'EMPTY_FILE');

  // The header row is the first of the top rows that names at least two known columns (titles above it are allowed).
  const lookup = new Map<string, ImportField>();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<[ImportField, string[]]>) {
    for (const alias of aliases) lookup.set(alias, field);
  }
  let headerRow = 0;
  let columns = new Map<number, ImportField>();
  for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
    const found = new Map<number, ImportField>();
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
      const field = lookup.get(normalizeHeader(cellText(cell.value)));
      if (field && ![...found.values()].includes(field)) found.set(col, field);
    });
    if (found.size >= 2) {
      headerRow = r;
      columns = found;
      break;
    }
  }
  const have = new Set(columns.values());
  const missing = REQUIRED_FIELDS.filter((f) => !have.has(f));
  if (!headerRow || missing.length) {
    const seen: string[] = [];
    ws.getRow(headerRow || 1).eachCell((cell) => seen.push(cellText(cell.value)));
    throw Errors.badRequest(
      `The file is missing required column${(headerRow ? missing : REQUIRED_FIELDS).length > 1 ? 's' : ''}: ${(headerRow ? missing : REQUIRED_FIELDS).map((f) => FIELD_LABELS[f]).join(', ')}.`,
      { missing: (headerRow ? missing : REQUIRED_FIELDS).map((f) => FIELD_LABELS[f]), found: seen.filter(Boolean) },
      'MISSING_COLUMNS',
    );
  }

  const recognised: ParsedFile['recognised'] = {};
  const ignoredHeaders: string[] = [];
  ws.getRow(headerRow).eachCell((cell, col) => {
    const field = columns.get(col);
    const text = cellText(cell.value);
    if (field) recognised[field] = text;
    else if (text) ignoredHeaders.push(text);
  });

  const rows: RawRow[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const values: RawRow['values'] = {};
    let any = false;
    for (const [col, field] of columns) {
      const text = cellText(ws.getRow(r).getCell(col).value);
      if (text) any = true;
      values[field] = text;
    }
    if (!any) continue; // fully blank rows are ignored
    rows.push({ rowNumber: r, values });
    if (rows.length > MAX_IMPORT_ROWS) {
      throw Errors.badRequest(`The file has more than ${MAX_IMPORT_ROWS} rows. Split it into smaller files.`, undefined, 'TOO_MANY_ROWS');
    }
  }
  if (!rows.length) throw Errors.badRequest('The file has a header row but no student rows.', undefined, 'EMPTY_FILE');
  return { rows, recognised, ignoredHeaders };
}

/** "Class 1", "1", "Grade 1" -> 1; "1B" -> grade 1 and section B. */
export function parseClass(raw: string): { grade: number; code: string | null } | null {
  const cleaned = raw.toUpperCase().replace(/\b(CLASS|GRADE|STD|FORM)\b\.?/g, '').replace(/\s+/g, '');
  const m = /^(\d{1,2})([A-Z])?$/.exec(cleaned);
  return m ? { grade: Number(m[1]), code: m[2] ?? null } : null;
}

/** "B", "b", "1B" -> "B" (and the grade if one was typed). */
export function parseSection(raw: string): { code: string; grade: number | null } | null {
  const cleaned = raw.toUpperCase().replace(/\b(SECTION|CLASS)\b\.?/g, '').replace(/\s+/g, '');
  const m = /^(?:(\d{1,2}))?([A-Z])$/.exec(cleaned);
  return m ? { code: m[2]!, grade: m[1] ? Number(m[1]) : null } : null;
}

/** "2026/2027", "2026-2027" -> "2026/2027"; anything else -> null. */
export function parseAcademicYear(raw: string): string | null {
  const m = /^(\d{4})\s*[/\-–]\s*(\d{4})$/.exec(raw.trim());
  return m && Number(m[2]) === Number(m[1]) + 1 ? `${m[1]}/${m[2]}` : null;
}
