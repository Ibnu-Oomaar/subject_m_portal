import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Errors } from '../common/errors';
import type { AuthContext } from '../common/types';
import { PostgresStateService } from '../database/postgres-state.service';
import { AuditService } from '../security/audit.service';
import { Enrollment } from '../students/enrollment.entity';
import { Student } from '../students/student.entity';
import { isValidStudentId, normalizeStudentId } from '../students/students.service';
import { TeacherScopeService } from '../teachers/teachers.service';
import { ExcelService } from './excel.service';
import { FIELD_LABELS, parseAcademicYear, parseClass, parseSection, parseStudentFile, type ImportField } from './import-parser';

const PLAN_TTL_SECONDS = 30 * 60;
const MAX_PREVIEW_ROWS = 1000;
const CHUNK = 500;

export interface ImportIssue {
  severity: 'error' | 'warning';
  code: string;
  field?: string;
  message: string;
}

export interface PreviewRow {
  rowNumber: number;
  studentId: string;
  fullName: string;
  className: string | null;
  sectionLabel: string | null;
  /** new = a student the portal has not seen · returning = known from a previous year · error = will not be imported */
  status: 'new' | 'returning' | 'error';
  issues: ImportIssue[];
}

interface PlanRow {
  rowNumber: number;
  studentId: string;
  fullName: string;
  sectionId: string;
  status: 'new' | 'returning';
}
interface StoredPlan {
  teacherId: string;
  academicYearId: string;
  fileName: string;
  rows: PlanRow[];
  errorCount: number;
}

@Injectable()
export class ImportService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly scope: TeacherScopeService,
    private readonly audit: AuditService,
    private readonly state: PostgresStateService,
    private readonly excel: ExcelService,
  ) {}

  /** Header row + instructions only: no sample students, so nothing fake can be imported by accident. */
  async template(): Promise<Buffer> {
    const wb = this.excel.createWorkbook();
    const ws = wb.addWorksheet('Students');
    const headers = ['Student ID', 'Student Name', 'Class', 'Section', 'Academic Year'];
    ws.addRow(headers);
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    [16, 32, 10, 10, 16].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    // Student IDs and years are text so Excel never turns 007 into 7 or 2026/2027 into a date
    ws.getColumn(1).numFmt = '@';
    ws.getColumn(5).numFmt = '@';
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    const help = wb.addWorksheet('Instructions');
    help.getColumn(1).width = 100;
    [
      'How to import students',
      '1. Fill the "Students" sheet: one student per row. Do not rename the column headings.',
      '2. Student ID, Student Name, Class and Section are required. Academic Year is optional; if present it must match the year you import into.',
      '3. Class is the grade number (for example 1 or "Class 1"). Section is the letter (B to H).',
      '4. Save as .xlsx or .csv (UTF-8) and upload it on the Import page. You will see a preview and any problems before anything is saved.',
      '5. Existing students (from earlier years) keep their history: they are only enrolled in the new year.',
    ].forEach((line, i) => {
      help.getCell(i + 1, 1).value = line;
      if (i === 0) help.getCell(1, 1).font = { bold: true, size: 14 };
    });
    return this.excel.toBuffer(wb);
  }

  async preview(auth: AuthContext, fileName: string, buffer: Buffer, academicYearId: string) {
    const [year] = (await this.dataSource.query(`SELECT id, label, status FROM academic_years WHERE id = $1`, [academicYearId])) as Array<{
      id: string;
      label: string;
      status: 'planned' | 'active' | 'closed';
    }>;
    if (!year) throw Errors.notFound('Academic year');
    if (year.status === 'closed') {
      throw Errors.conflict('This academic year is closed. Students can no longer be imported into it.', undefined, 'ACADEMIC_YEAR_CLOSED');
    }

    const parsed = await parseStudentFile(fileName, buffer);
    const allowed = new Set(await this.scope.sectionIds(auth.userId));
    const sections: Array<{ id: string; code: string; label: string; grade_level: number; class_name: string }> = await this.dataSource.query(
      `SELECT s.id, s.code, s.label, c.grade_level, c.name AS class_name FROM sections s JOIN classes c ON c.id = s.class_id`,
    );
    const byKey = new Map(sections.map((s) => [`${s.grade_level}:${s.code}`, s]));
    const validLabels = sections.filter((s) => allowed.has(s.id)).map((s) => s.label).sort();

    // pass 1: normalise IDs, find repeats inside the file
    const idOf = (v: Partial<Record<ImportField, string>>) => normalizeStudentId(v.studentId ?? '');
    const rowsById = new Map<string, number[]>();
    for (const r of parsed.rows) {
      const id = idOf(r.values);
      if (id) rowsById.set(id, [...(rowsById.get(id) ?? []), r.rowNumber]);
    }
    const lookupIds = [...rowsById.keys()].filter(isValidStudentId);
    const existingRows: Array<{ student_id: string; full_name: string; enrollment_id: string | null; section_label: string | null }> = lookupIds.length
      ? await this.dataSource.query(
          `SELECT s.student_id, s.full_name, e.id AS enrollment_id, sec.label AS section_label
             FROM students s
             LEFT JOIN enrollments e ON e.student_id = s.id AND e.academic_year_id = $2
             LEFT JOIN sections sec ON sec.id = e.section_id
            WHERE s.student_id = ANY($1::text[])`,
          [lookupIds, academicYearId],
        )
      : [];
    const existing = new Map(existingRows.map((r) => [r.student_id, r]));

    // pass 2: judge every row
    const rows: PreviewRow[] = [];
    const plan: PlanRow[] = [];
    for (const raw of parsed.rows) {
      const v = raw.values;
      const issues: ImportIssue[] = [];
      const err = (code: string, message: string, field?: ImportField) =>
        issues.push({ severity: 'error', code, message, field: field ? FIELD_LABELS[field] : undefined });
      const warn = (code: string, message: string, field?: ImportField) =>
        issues.push({ severity: 'warning', code, message, field: field ? FIELD_LABELS[field] : undefined });

      for (const f of ['studentId', 'fullName', 'class', 'section'] as ImportField[]) {
        if (!v[f]) err('MISSING_VALUE', `${FIELD_LABELS[f]} is missing.`, f);
      }
      const studentId = idOf(v);
      if (studentId && !isValidStudentId(studentId)) {
        err('INVALID_STUDENT_ID', `"${v.studentId}" is not a valid Student ID (use letters, numbers, - or _; 3-32 characters).`, 'studentId');
      }
      const fullName = v.fullName ?? '';
      if (fullName.length > 150) err('NAME_TOO_LONG', 'The name is longer than 150 characters.', 'fullName');

      let section: (typeof sections)[number] | undefined;
      if (v.class && v.section) {
        const cls = parseClass(v.class);
        const sec = parseSection(v.section);
        if (!cls) err('INVALID_CLASS', `"${v.class}" is not a valid class (for example 1 or Class 1).`, 'class');
        if (!sec) err('INVALID_SECTION', `"${v.section}" is not a valid section (a single letter such as B).`, 'section');
        if (cls && sec) {
          if ((cls.code && cls.code !== sec.code) || (sec.grade !== null && sec.grade !== cls.grade)) {
            err('CLASS_SECTION_MISMATCH', `Class "${v.class}" and section "${v.section}" do not match.`, 'section');
          } else {
            section = byKey.get(`${cls.grade}:${sec.code}`);
            if (!section) err('UNKNOWN_SECTION', `Class ${cls.grade}${sec.code} does not exist. Available sections: ${validLabels.join(', ')}.`, 'section');
            else if (!allowed.has(section.id)) err('SECTION_NOT_ASSIGNED', `Section ${section.label} is not assigned to you.`, 'section');
          }
        }
      }

      if (v.academicYear) {
        const label = parseAcademicYear(v.academicYear);
        if (!label) err('INVALID_YEAR', `"${v.academicYear}" is not a valid academic year (for example 2026/2027).`, 'academicYear');
        else if (label !== year.label) err('YEAR_MISMATCH', `This row is for ${label}, but you are importing into ${year.label}.`, 'academicYear');
      }

      const repeats = studentId ? (rowsById.get(studentId) ?? []) : [];
      if (repeats.length > 1) {
        err('DUPLICATE_IN_FILE', `Student ID ${studentId} also appears on row ${repeats.filter((n) => n !== raw.rowNumber).join(', ')}.`, 'studentId');
      }

      const known = studentId ? existing.get(studentId) : undefined;
      let status: PreviewRow['status'] = 'new';
      if (known?.enrollment_id) {
        err('ALREADY_ENROLLED', `${studentId} is already enrolled in ${year.label} (section ${known.section_label}).`, 'studentId');
      } else if (known) {
        status = 'returning';
        if (fullName && known.full_name.toLowerCase() !== fullName.toLowerCase()) {
          warn('NAME_DIFFERS', `The portal already has this student as "${known.full_name}". The existing name is kept.`, 'fullName');
        }
      }

      const hasError = issues.some((i) => i.severity === 'error');
      if (hasError) status = 'error';
      else plan.push({ rowNumber: raw.rowNumber, studentId, fullName: known?.full_name ?? fullName, sectionId: section!.id, status: status as 'new' | 'returning' });
      rows.push({
        rowNumber: raw.rowNumber,
        studentId: v.studentId ?? '',
        fullName,
        className: section ? section.class_name : null,
        sectionLabel: section ? section.label : null,
        status,
        issues,
      });
    }

    const errorRows = rows.filter((r) => r.status === 'error');
    const token = randomUUID();
    const stored: StoredPlan = { teacherId: auth.userId, academicYearId, fileName, rows: plan, errorCount: errorRows.length };
    await this.state.setJson(`import:${token}`, stored, PLAN_TTL_SECONDS);

    // keep the response small for huge files: all problems first, then as many good rows as fit
    let shown = rows;
    if (rows.length > MAX_PREVIEW_ROWS) {
      const room = Math.max(MAX_PREVIEW_ROWS - Math.min(errorRows.length, MAX_PREVIEW_ROWS), 0);
      shown = [...errorRows.slice(0, MAX_PREVIEW_ROWS), ...rows.filter((r) => r.status !== 'error').slice(0, room)].sort((a, b) => a.rowNumber - b.rowNumber);
    }
    const bySection = new Map<string, number>();
    for (const p of plan) {
      const label = sections.find((s) => s.id === p.sectionId)!.label;
      bySection.set(label, (bySection.get(label) ?? 0) + 1);
    }
    return {
      token,
      expiresInSeconds: PLAN_TTL_SECONDS,
      academicYear: { id: year.id, label: year.label },
      fileName,
      columns: { recognised: parsed.recognised, ignored: parsed.ignoredHeaders, academicYearColumnPresent: parsed.recognised.academicYear !== undefined },
      summary: {
        totalRows: rows.length,
        importable: plan.length,
        new: plan.filter((p) => p.status === 'new').length,
        returning: plan.filter((p) => p.status === 'returning').length,
        withErrors: errorRows.length,
        withWarnings: rows.filter((r) => r.issues.some((i) => i.severity === 'warning')).length,
        bySection: [...bySection.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, count]) => ({ label, count })),
      },
      rows: shown,
      truncated: shown.length < rows.length,
    };
  }

  /** Saves a previewed import. The token is single-use: a second click or a replayed request cannot import twice. */
  async commit(auth: AuthContext, token: string, skipInvalid: boolean) {
    const lockKey = `import:lock:${token}`;
    const lock = await this.state.acquireLock(lockKey, 120);
    if (!lock) throw Errors.conflict('This import is already being saved.', undefined, 'IMPORT_IN_PROGRESS');
    try {
      const plan = await this.state.getJson<StoredPlan>(`import:${token}`);
      // A preview belonging to another teacher is reported exactly like a missing one: its existence is not revealed.
      if (!plan || plan.teacherId !== auth.userId) {
        throw Errors.conflict('This import preview has expired or was already saved. Upload the file again.', undefined, 'IMPORT_EXPIRED');
      }
      if (plan.errorCount > 0 && !skipInvalid) {
        throw Errors.conflict(
          `${plan.errorCount} row${plan.errorCount === 1 ? ' has' : 's have'} errors. Fix the file, or confirm that the rows with errors should be skipped.`,
          { errorCount: plan.errorCount },
          'IMPORT_HAS_ERRORS',
        );
      }
      if (!plan.rows.length) throw Errors.conflict('There are no valid rows to import.', undefined, 'NOTHING_TO_IMPORT');

      const batchId = randomUUID();
      const result = await this.dataSource.transaction(async (m) => {
        const [year] = (await m.query(`SELECT id, label, status FROM academic_years WHERE id = $1 FOR SHARE`, [plan.academicYearId])) as Array<{ id: string; label: string; status: string }>;
        if (!year) throw Errors.notFound('Academic year');
        if (year.status === 'closed') throw Errors.conflict('This academic year is closed.', undefined, 'ACADEMIC_YEAR_CLOSED');

        // The data may have changed since the preview: check again inside the transaction.
        const now: Array<{ id: string; student_id: string; enrollment_id: string | null }> = await m.query(
          `SELECT s.id, s.student_id, e.id AS enrollment_id
             FROM students s LEFT JOIN enrollments e ON e.student_id = s.id AND e.academic_year_id = $2
            WHERE s.student_id = ANY($1::text[]) FOR UPDATE OF s`,
          [plan.rows.map((r) => r.studentId), plan.academicYearId],
        );
        const known = new Map(now.map((r) => [r.student_id, r]));
        const raced = plan.rows.filter((r) => known.get(r.studentId)?.enrollment_id).map((r) => r.studentId);
        if (raced.length) {
          throw Errors.conflict('Some students were enrolled after you previewed the file. Upload it again to review the changes.', { studentIds: raced.slice(0, 50) }, 'IMPORT_STALE');
        }

        const fresh = plan.rows.filter((r) => !known.has(r.studentId));
        for (let i = 0; i < fresh.length; i += CHUNK) {
          await m.insert(
            Student,
            fresh.slice(i, i + CHUNK).map((r) => ({ studentId: r.studentId, fullName: r.fullName })),
          );
        }
        const ids: Array<{ id: string; student_id: string }> = await m.query(`SELECT id, student_id FROM students WHERE student_id = ANY($1::text[])`, [plan.rows.map((r) => r.studentId)]);
        const uuidOf = new Map(ids.map((r) => [r.student_id, r.id]));
        for (let i = 0; i < plan.rows.length; i += CHUNK) {
          await m.insert(
            Enrollment,
            plan.rows.slice(i, i + CHUNK).map((r) => ({ studentId: uuidOf.get(r.studentId)!, academicYearId: plan.academicYearId, sectionId: r.sectionId })),
          );
        }
        const summary = { enrolled: plan.rows.length, newStudents: fresh.length, returningStudents: plan.rows.length - fresh.length, skippedRows: plan.errorCount };
        await this.audit.log(m, {
          actor: auth,
          action: 'student.import',
          entityType: 'import',
          batchId,
          academicYearId: plan.academicYearId,
          after: { ...summary, fileName: plan.fileName },
          context: { academicYear: year.label, fileName: plan.fileName },
        });
        return summary;
      });

      await this.state.delete(`import:${token}`);
      await this.state.invalidate(`year:${plan.academicYearId}`);
      return result;
    } finally {
      await this.state.releaseLock(lockKey, lock);
    }
  }
}
