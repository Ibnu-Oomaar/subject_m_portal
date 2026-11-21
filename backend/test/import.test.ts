import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import ExcelJS from 'exceljs';
import { cellText, detectFormat, parseAcademicYear, parseClass, parseSection, parseStudentFile } from '../src/excel/import-parser';
import { Client, startApp, type TestApp } from './helpers';

const csv = (s: string) => Buffer.from(s, 'utf8');
const rowsOf = async (name: string, buf: Buffer) => (await parseStudentFile(name, buf)).rows.map((r) => r.values);
const rejects = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e: any) {
    return e.getResponse?.() ?? e;
  }
  throw new Error('expected the promise to reject');
};

async function xlsxBuffer(build: (ws: ExcelJS.Worksheet) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  build(wb.addWorksheet('Sheet1'));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('import parser (no database)', () => {
  test('CSV: BOM, CRLF, quoted commas, leading-zero IDs and loose header spellings', async () => {
    const file = csv('﻿Student ID,"Student Name",Grade,Stream,Academic Year\r\n007,"Otieno, Brian",1,b,2026/2027\r\n"008",Amina Ali,Class 1,C,\r\n');
    const rows = await rowsOf('students.csv', file);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ studentId: '007', fullName: 'Otieno, Brian', class: '1', section: 'b', academicYear: '2026/2027' });
    expect(rows[1]!.studentId).toBe('008'); // not 8
    expect(rows[1]!.academicYear).toBe('');
  });

  test('CSV: blank lines are ignored and row numbers match the file', async () => {
    const parsed = await parseStudentFile('s.csv', csv('Student ID,Name,Class,Section\n\nA-1,Ann,1,B\n,,,\nA-2,Bob,1,C\n'));
    expect(parsed.rows.map((r) => r.rowNumber)).toEqual([3, 5]);
  });

  test('XLSX: title rows above the header, numeric IDs, rich text and extra columns', async () => {
    const buf = await xlsxBuffer((ws) => {
      ws.addRow(['Class list 2026']);
      ws.addRow([]);
      ws.addRow(['Student ID', 'Student Name', 'Class', 'Section', 'Phone']);
      ws.addRow([12345, { richText: [{ text: 'Cyn' }, { text: 'thia  Mwangi' }] }, 1, 'D', '0700']);
    });
    const parsed = await parseStudentFile('students.xlsx', buf);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]!.rowNumber).toBe(4);
    expect(parsed.rows[0]!.values).toMatchObject({ studentId: '12345', fullName: 'Cynthia Mwangi', class: '1', section: 'D' });
    expect(parsed.ignoredHeaders).toEqual(['Phone']);
  });

  test('missing required columns are reported by name', async () => {
    const err = await rejects(parseStudentFile('s.csv', csv('Student ID,Student Name\nA-1,Ann\n')));
    expect(err.code).toBe('MISSING_COLUMNS');
    expect(err.details.missing).toEqual(['Class', 'Section']);
  });

  test('files that only pretend to be spreadsheets are rejected', async () => {
    expect((await rejects(parseStudentFile('evil.xlsx', Buffer.from('MZ\x90\x00 this is an executable')))).code).toBe('INVALID_FILE');
    expect((await rejects(parseStudentFile('data.csv', Buffer.from([0x41, 0x2c, 0x00, 0x01, 0xff])))).code).toBe('INVALID_FILE');
    expect((await rejects(parseStudentFile('latin1.csv', Buffer.from([0x4e, 0x61, 0x6d, 0x65, 0x2c, 0xe9])))).code).toBe('INVALID_FILE');
    expect(() => detectFormat('notes.pdf', Buffer.from('%PDF'))).toThrow();
    // a text file renamed to .xlsx passes the magic-byte check only if it is a ZIP; it must still fail to load cleanly
    expect((await rejects(parseStudentFile('fake.xlsx', Buffer.from('PK this is not a zip')))).code).toBe('INVALID_FILE');
  });

  test('empty file and header-only file', async () => {
    expect((await rejects(parseStudentFile('e.csv', csv('')))).code).toBe('EMPTY_FILE');
    expect((await rejects(parseStudentFile('h.csv', csv('Student ID,Name,Class,Section\n')))).code).toBe('EMPTY_FILE');
  });

  test('more than the row limit is refused', async () => {
    const lines = ['Student ID,Name,Class,Section'];
    for (let i = 0; i < 5001; i++) lines.push(`S${String(i).padStart(5, '0')},Student ${i},1,B`);
    expect((await rejects(parseStudentFile('big.csv', csv(lines.join('\n'))))).code).toBe('TOO_MANY_ROWS');
  });

  test('cell, class, section and year normalisers', () => {
    expect(cellText('  Ann   Lee ')).toBe('Ann Lee');
    expect(cellText({ formula: 'A1', result: 5 } as ExcelJS.CellValue)).toBe('5');
    expect(cellText(null)).toBe('');
    expect(parseClass('Class 1')).toEqual({ grade: 1, code: null });
    expect(parseClass('1b')).toEqual({ grade: 1, code: 'B' });
    expect(parseClass('first')).toBeNull();
    expect(parseSection('b')).toEqual({ code: 'B', grade: null });
    expect(parseSection('1B')).toEqual({ code: 'B', grade: 1 });
    expect(parseSection('BB')).toBeNull();
    expect(parseAcademicYear('2026-2027')).toBe('2026/2027');
    expect(parseAcademicYear('2026/2028')).toBeNull();
    expect(parseAcademicYear('26/27')).toBeNull();
  });
});

describe('student import (HTTP, database)', () => {
  let t: TestApp;
  let teacher: Client;
  let other: Client; // only assigned to 1C
  let year1 = '';
  let year2 = '';
  const S: Record<string, string> = {};

  const upload = (c: Client, yearId: string, content: Buffer | string, fileName = 'students.csv', path = '/imports/students/preview') => {
    const fd = new FormData();
    if (content !== null) fd.append('file', new Blob([typeof content === 'string' ? Buffer.from(content) : content]), fileName);
    if (yearId) fd.append('academicYearId', yearId);
    return c.request('POST', path, fd);
  };
  const count = async (sql: string, params: unknown[] = []) => Number(((await t.ds.query(sql, params)) as Array<{ n: string }>)[0]!.n);
  const students = () => count(`SELECT count(*) AS n FROM students`);
  const enrollments = (year: string) => count(`SELECT count(*) AS n FROM enrollments WHERE academic_year_id = $1`, [year]);
  const HEADER = 'Student ID,Student Name,Class,Section,Academic Year\n';

  beforeAll(async () => {
    t = await startApp();
    await t.teachers.create({ name: 'Ms Test' });
    await t.teachers.create({ name: 'Mr Other', sectionLabels: ['1C'] });
    teacher = t.client();
    other = t.client();
    expect((await teacher.loginTeacher('Ms Test')).status).toBe(200);
    expect((await other.loginTeacher('Mr Other')).status).toBe(200);
    for (const sec of (await teacher.get('/classes')).body[0].sections) S[sec.code] = sec.id;
    year1 = (await teacher.post('/academic-years', { label: '2026/2027' })).body.id;
    year2 = (await teacher.post('/academic-years', { label: '2027/2028' })).body.id;
  });
  afterAll(async () => {
    await t.close();
  });

  test('template is a real workbook with the five headings and no sample students', async () => {
    const r = await teacher.get('/imports/students/template');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('spreadsheetml');
    expect(r.headers.get('content-disposition')).toContain('attachment');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.raw as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet('Students')!;
    expect(ws.getRow(1).values).toEqual([undefined, 'Student ID', 'Student Name', 'Class', 'Section', 'Academic Year']);
    expect(ws.rowCount).toBe(1);
  });

  test('the import endpoints need a teacher session and a CSRF token', async () => {
    const anon = t.client();
    expect((await upload(anon, year1, HEADER + 'A-1,Ann,1,B,\n')).status).toBe(401);
    const student = t.client();
    await teacher.post('/students', { academicYearId: year1, sectionId: S.B, studentId: 'ST-1', fullName: 'Student One' });
    expect((await student.loginStudent('ST-1')).status).toBe(200);
    expect((await upload(student, year1, HEADER + 'A-1,Ann,1,B,\n')).status).toBe(403);
    expect((await student.get('/imports/students/template')).status).toBe(403);
    const noCsrf = t.client();
    noCsrf.cookie = teacher.cookie; // same session, no token
    expect((await upload(noCsrf, year1, HEADER + 'A-1,Ann,1,B,\n')).status).toBe(403);
    // clean up so counts below are exact
    await t.ds.query(`TRUNCATE enrollments, students CASCADE`);
  });

  test('preview classifies every row and writes nothing', async () => {
    // an existing enrolment (already in year 1) and a student known only from the past
    await teacher.post('/students', { academicYearId: year1, sectionId: S.B, studentId: 'EXIST-1', fullName: 'Existing Student' });
    const before = [await students(), await enrollments(year1)];
    const file =
      HEADER +
      '1001,Amina Ali,1,B,2026/2027\n' + // ok
      '1002,Brian Otieno,Class 1,c,\n' + // ok, loose spelling, no year
      ',No Id,1,B,\n' + // missing id
      'bad id!,Bad Id,1,B,\n' + // invalid id
      '1003,Wrong Section,1,Z,\n' + // unknown section
      '1004,Mismatch,2,B,\n' + // class 2 does not exist
      '1005,Wrong Year,1,B,2025/2026\n' + // year mismatch
      '1006,Dup One,1,B,\n' +
      '1006,Dup Two,1,B,\n' + // duplicate inside the file (both rows flagged)
      'exist-1,Existing Student,1,B,\n' + // already enrolled in this year
      '1007,,1,B,\n'; // missing name
    const r = await upload(teacher, year1, file);
    expect(r.status).toBe(200);
    expect(r.body.academicYear.label).toBe('2026/2027');
    const by = (n: number) => r.body.rows.find((x: any) => x.rowNumber === n);
    expect(by(2).status).toBe('new');
    expect(by(2).sectionLabel).toBe('1B');
    expect(by(3).status).toBe('new');
    expect(by(3).sectionLabel).toBe('1C');
    expect(by(4).issues[0].code).toBe('MISSING_VALUE');
    expect(by(5).issues.map((i: any) => i.code)).toContain('INVALID_STUDENT_ID');
    expect(by(6).issues.map((i: any) => i.code)).toContain('UNKNOWN_SECTION');
    expect(by(7).issues.map((i: any) => i.code)).toContain('UNKNOWN_SECTION'); // 2B is not a section
    expect(by(8).issues.map((i: any) => i.code)).toContain('YEAR_MISMATCH');
    expect(by(9).issues.map((i: any) => i.code)).toContain('DUPLICATE_IN_FILE');
    expect(by(10).issues.map((i: any) => i.code)).toContain('DUPLICATE_IN_FILE');
    expect(by(11).issues.map((i: any) => i.code)).toContain('ALREADY_ENROLLED');
    expect(by(12).issues.map((i: any) => i.code)).toContain('MISSING_VALUE');
    expect(r.body.summary).toMatchObject({ totalRows: 11, importable: 2, new: 2, returning: 0, withErrors: 9 });
    expect(r.body.summary.bySection).toEqual([
      { label: '1B', count: 1 },
      { label: '1C', count: 1 },
    ]);
    // nothing was saved
    expect([await students(), await enrollments(year1)]).toEqual(before);
  });

  test('commit is refused while errors remain, unless the teacher confirms skipping them', async () => {
    const file = HEADER + '2001,Valid One,1,D,\n2002,Valid Two,1,E,\n2003,Broken,1,Q,\n';
    const preview = (await upload(teacher, year1, file)).body;
    expect(preview.summary).toMatchObject({ importable: 2, withErrors: 1 });
    const before = await students();

    const refused = await teacher.post('/imports/students/commit', { token: preview.token });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('IMPORT_HAS_ERRORS');
    expect(await students()).toBe(before);

    const ok = await teacher.post('/imports/students/commit', { token: preview.token, skipInvalid: true });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ enrolled: 2, newStudents: 2, returningStudents: 0, skippedRows: 1 });
    expect(await students()).toBe(before + 2);

    const list = (await teacher.get(`/students?academicYearId=${year1}&sectionId=${S.D}`)).body;
    expect(list.items.map((i: any) => i.studentId)).toContain('2001');
    expect(list.items.find((i: any) => i.studentId === '2001').fullName).toBe('Valid One');

    // the audit trail records who imported what, into which year
    const [audit] = await t.ds.query(`SELECT action, academic_year_id, after_data, actor_id FROM audit_logs WHERE action = 'student.import'`);
    expect(audit.academic_year_id).toBe(year1);
    expect(audit.after_data).toMatchObject({ enrolled: 2, newStudents: 2, skippedRows: 1 });
    expect(audit.actor_id).toBeTruthy();

    // the token is single use: replaying the request cannot import twice
    const replay = await teacher.post('/imports/students/commit', { token: preview.token, skipInvalid: true });
    expect(replay.status).toBe(409);
    expect(replay.body.error.code).toBe('IMPORT_EXPIRED');
    expect(await students()).toBe(before + 2);
  });

  test('a clean file commits without needing skipInvalid', async () => {
    const preview = (await upload(teacher, year1, HEADER + '3001,Clean One,1,F,\n3002,Clean Two,1,F,2026-2027\n')).body;
    expect(preview.summary.withErrors).toBe(0);
    const ok = await teacher.post('/imports/students/commit', { token: preview.token });
    expect(ok.status).toBe(201);
    expect(ok.body.enrolled).toBe(2);
  });

  test("another teacher cannot use a preview that is not theirs, and cannot import into sections they do not teach", async () => {
    const preview = (await upload(teacher, year1, HEADER + '4001,Someone,1,G,\n')).body;
    const stolen = await other.post('/imports/students/commit', { token: preview.token });
    expect(stolen.status).toBe(409);
    expect(stolen.body.error.code).toBe('IMPORT_EXPIRED');
    expect(await count(`SELECT count(*) AS n FROM students WHERE student_id = '4001'`)).toBe(0);

    const mine = (await upload(other, year1, HEADER + '4002,Only C,1,C,\n4003,Not Mine,1,D,\n')).body;
    expect(mine.rows.find((r: any) => r.studentId === '4002').status).toBe('new');
    const notMine = mine.rows.find((r: any) => r.studentId === '4003');
    expect(notMine.status).toBe('error');
    expect(notMine.issues[0].code).toBe('SECTION_NOT_ASSIGNED');
    // the other teacher's preview is left unused so the data below stays predictable
  });

  test('returning students keep their identity and history; a different name only produces a warning', async () => {
    const [cyn] = await t.ds.query(`SELECT id FROM students WHERE student_id = '3001'`);
    const e1 = (await t.ds.query(`SELECT id FROM enrollments WHERE student_id = $1 AND academic_year_id = $2`, [cyn.id, year1]))[0].id;
    // give the student a 2026/2027 mark so we can prove it survives progression
    const put = await teacher.put('/assessments/marks', {
      academicYearId: year1,
      sectionId: S.F,
      term: 1,
      entries: [{ enrollmentId: e1, version: 0, classActivities: 7, homeworkAssignments: 5, learningMaterialsNotebook: 8, textbook: 4 }],
    });
    expect(put.status).toBe(200);

    const preview = (await upload(teacher, year2, HEADER + '3001,Cynthia M. Renamed,1,G,\n3002,Clean Two,1,H,\n5001,Brand New,1,B,\n')).body;
    expect(preview.summary).toMatchObject({ new: 1, returning: 2, withErrors: 0, importable: 3 });
    const returning = preview.rows.find((r: any) => r.studentId === '3001');
    expect(returning.status).toBe('returning');
    expect(returning.issues[0]).toMatchObject({ severity: 'warning', code: 'NAME_DIFFERS' });
    expect(preview.summary.withWarnings).toBe(1);

    const studentsBefore = await students();
    const ok = await teacher.post('/imports/students/commit', { token: preview.token });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ enrolled: 3, newStudents: 1, returningStudents: 2 });
    expect(await students()).toBe(studentsBefore + 1); // no duplicate student rows for returning students

    // same student record, kept name, two enrolments (one per year), earlier marks untouched
    const [after] = await t.ds.query(`SELECT full_name FROM students WHERE id = $1`, [cyn.id]);
    expect(after.full_name).toBe('Clean One'); // the name imported in year 1 is kept, not overwritten
    expect(await count(`SELECT count(*) AS n FROM enrollments WHERE student_id = $1`, [cyn.id])).toBe(2);
    const sheet = (await teacher.get(`/assessments/sheet?academicYearId=${year1}&sectionId=${S.F}&term=1`)).body;
    const kept = sheet.rows.find((r: any) => r.enrollmentId === e1);
    expect(kept.total).toBe(24);
  });

  test('a student enrolled between preview and commit is detected, not duplicated', async () => {
    const preview = (await upload(teacher, year1, HEADER + '6001,Racer,1,B,\n')).body;
    expect((await teacher.post('/students', { academicYearId: year1, sectionId: S.C, studentId: '6001', fullName: 'Racer' })).status).toBe(201);
    const r = await teacher.post('/imports/students/commit', { token: preview.token });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('IMPORT_STALE');
    expect(await count(`SELECT count(*) AS n FROM enrollments e JOIN students s ON s.id = e.student_id WHERE s.student_id = '6001' AND e.academic_year_id = $1`, [year1])).toBe(1);
  });

  test('two simultaneous commits of one preview import exactly once', async () => {
    const preview = (await upload(teacher, year1, HEADER + '7001,Once Only,1,H,\n7002,Once Only Too,1,H,\n')).body;
    const results = await Promise.all([
      teacher.post('/imports/students/commit', { token: preview.token }),
      teacher.post('/imports/students/commit', { token: preview.token }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await count(`SELECT count(*) AS n FROM students WHERE student_id IN ('7001','7002')`)).toBe(2);
    expect(await count(`SELECT count(*) AS n FROM enrollments e JOIN students s ON s.id = e.student_id WHERE s.student_id IN ('7001','7002')`)).toBe(2);
  });

  test('XLSX uploads work end to end, including numeric IDs written as numbers', async () => {
    const buf = await xlsxBuffer((ws) => {
      ws.addRow(['Student ID', 'Student Name', 'Class', 'Section', 'Academic Year']);
      ws.addRow([8001, 'Excel Student', 1, 'B', '2026/2027']);
    });
    const preview = (await upload(teacher, year1, buf, 'class.xlsx')).body;
    expect(preview.summary).toMatchObject({ importable: 1, withErrors: 0 });
    expect(preview.rows[0].studentId).toBe('8001');
    expect((await teacher.post('/imports/students/commit', { token: preview.token })).status).toBe(201);
  });

  test('bad uploads get clear errors: no file, wrong type, fake xlsx, missing columns, oversized, unknown year', async () => {
    const noFile = await upload(teacher, year1, null as never);
    expect(noFile.status).toBe(400);
    expect(noFile.body.error.code).toBe('FILE_REQUIRED');
    expect((await upload(teacher, year1, '%PDF-1.4', 'notes.pdf')).body.error.code).toBe('INVALID_FILE');
    expect((await upload(teacher, year1, 'not really a workbook', 'fake.xlsx')).body.error.code).toBe('INVALID_FILE');
    const missing = await upload(teacher, year1, 'Student ID,Student Name\nA,B\n');
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('MISSING_COLUMNS');
    const huge = await upload(teacher, year1, Buffer.alloc(5 * 1024 * 1024 + 1024, 0x61), 'huge.csv');
    expect(huge.status).toBe(413);
    expect((await upload(teacher, '', HEADER + 'A-1,Ann,1,B,\n')).status).toBe(400);
    expect((await upload(teacher, '00000000-0000-4000-8000-000000000000', HEADER + 'A-1,Ann,1,B,\n')).status).toBe(404);
    expect((await teacher.post('/imports/students/commit', { token: 'not-a-uuid' })).status).toBe(400);
  });

  test('names that look like spreadsheet formulas are stored as typed (and neutralised only on export)', async () => {
    const preview = (await upload(teacher, year1, HEADER + '9001,"=HYPERLINK(""http://x"",""click"")",1,B,\n')).body;
    expect(preview.rows[0].status).toBe('new');
    expect((await teacher.post('/imports/students/commit', { token: preview.token })).status).toBe(201);
    const [row] = await t.ds.query(`SELECT full_name FROM students WHERE student_id = '9001'`);
    expect(row.full_name).toBe('=HYPERLINK("http://x","click")');
  });

  test('a closed academic year cannot receive imports; earlier records are untouched', async () => {
    const year1Before = await enrollments(year1);
    const early = (await upload(teacher, year1, HEADER + '9503,Early Preview,1,B,\n')).body; // year 1 still open
    const planned = (await upload(teacher, year2, HEADER + '9501,Late Student,1,B,\n')).body; // planned years accept imports
    expect(early.summary.importable).toBe(1);
    expect((await teacher.post(`/academic-years/${year2}/activate`)).status).toBe(200); // closes year 1

    const closedPreview = await upload(teacher, year1, HEADER + '9502,Too Late,1,B,\n');
    expect(closedPreview.status).toBe(409);
    expect(closedPreview.body.error.code).toBe('ACADEMIC_YEAR_CLOSED');
    // a preview made before the year closed cannot be committed after it closed
    const lateCommit = await teacher.post('/imports/students/commit', { token: early.token });
    expect(lateCommit.status).toBe(409);
    expect(lateCommit.body.error.code).toBe('ACADEMIC_YEAR_CLOSED');
    expect(await count(`SELECT count(*) AS n FROM students WHERE student_id = '9503'`)).toBe(0);
    // the year that is open still takes its preview, and year 1's records are all still there
    expect((await teacher.post('/imports/students/commit', { token: planned.token })).status).toBe(201);
    expect(await enrollments(year1)).toBe(year1Before);
  });
});
