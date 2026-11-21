import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hand-written: database-level safeguards that column constraints cannot express, plus the fixed reference
 * data (assessment categories, Class 1 and its sections B-H). Academic years, students and teachers are
 * never seeded here - they are real data entered through the portal.
 */
export class IntegrityAndReferenceData1763000000002 implements MigrationInterface {
  name = 'IntegrityAndReferenceData1763000000002';

  async up(q: QueryRunner): Promise<void> {
    // ---- exam_marks: marks <= examination maximum, and the student must sit in the exam's section + year
    await q.query(`
      CREATE FUNCTION exam_marks_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE ex RECORD; en RECORD;
      BEGIN
        SELECT max_marks, section_id, academic_year_id INTO ex FROM examinations WHERE id = NEW.examination_id;
        SELECT section_id, academic_year_id INTO en FROM enrollments WHERE id = NEW.enrollment_id;
        IF en.section_id <> ex.section_id OR en.academic_year_id <> ex.academic_year_id THEN
          RAISE EXCEPTION 'Enrollment does not belong to the section and academic year of this examination'
            USING ERRCODE = '23514';
        END IF;
        IF NEW.marks > ex.max_marks THEN
          RAISE EXCEPTION 'Marks % exceed the examination maximum %', NEW.marks, ex.max_marks USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END $$`);
    await q.query(`
      CREATE TRIGGER trg_exam_marks_integrity BEFORE INSERT OR UPDATE OF marks, enrollment_id, examination_id
      ON exam_marks FOR EACH ROW EXECUTE FUNCTION exam_marks_integrity()`);

    // ---- examinations: cannot lower the maximum below an existing mark, nor move an exam that has marks
    await q.query(`
      CREATE FUNCTION examinations_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.max_marks < OLD.max_marks AND EXISTS (
          SELECT 1 FROM exam_marks WHERE examination_id = NEW.id AND marks > NEW.max_marks
        ) THEN
          RAISE EXCEPTION 'An existing mark is higher than the new maximum' USING ERRCODE = '23514';
        END IF;
        IF (NEW.section_id <> OLD.section_id OR NEW.academic_year_id <> OLD.academic_year_id)
           AND EXISTS (SELECT 1 FROM exam_marks WHERE examination_id = NEW.id) THEN
          RAISE EXCEPTION 'An examination with marks cannot be moved to another section or academic year'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END $$`);
    await q.query(`
      CREATE TRIGGER trg_examinations_guard BEFORE UPDATE ON examinations
      FOR EACH ROW EXECUTE FUNCTION examinations_guard()`);

    // ---- enrollments: a student with marks cannot be moved to another section or year
    await q.query(`
      CREATE FUNCTION enrollments_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF (NEW.section_id <> OLD.section_id OR NEW.academic_year_id <> OLD.academic_year_id OR NEW.student_id <> OLD.student_id)
           AND (EXISTS (SELECT 1 FROM exam_marks WHERE enrollment_id = NEW.id)
             OR EXISTS (SELECT 1 FROM assessments WHERE enrollment_id = NEW.id)) THEN
          RAISE EXCEPTION 'An enrollment that already has marks cannot be changed' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END $$`);
    await q.query(`
      CREATE TRIGGER trg_enrollments_guard BEFORE UPDATE ON enrollments
      FOR EACH ROW EXECUTE FUNCTION enrollments_guard()`);

    // ---- finalized records can never be deleted (historical results stay intact)
    await q.query(`
      CREATE FUNCTION forbid_finalized_delete() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.status = 'finalized' THEN
          RAISE EXCEPTION 'Finalized records cannot be deleted' USING ERRCODE = '23514';
        END IF;
        RETURN OLD;
      END $$`);
    await q.query(`
      CREATE TRIGGER trg_assessments_no_finalized_delete BEFORE DELETE ON assessments
      FOR EACH ROW EXECUTE FUNCTION forbid_finalized_delete()`);
    await q.query(`
      CREATE TRIGGER trg_exam_marks_no_finalized_delete BEFORE DELETE ON exam_marks
      FOR EACH ROW EXECUTE FUNCTION forbid_finalized_delete()`);

    // ---- audit log is append-only
    await q.query(`
      CREATE FUNCTION audit_logs_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = '23514';
      END $$`);
    await q.query(`
      CREATE TRIGGER trg_audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only()`);

    // ---- fixed reference data
    await q.query(`
      INSERT INTO assessment_categories (code, name, max_marks, sort_order) VALUES
        ('class_activities', 'Class Activities', 9, 1),
        ('homework_assignments', 'Homeworks and Assignments', 6, 2),
        ('learning_materials_notebook', 'Learning Materials and Notebook', 10, 3),
        ('textbook', 'Textbook', 5, 4)`);
    await q.query(`INSERT INTO classes (grade_level, name) VALUES (1, 'Class 1')`);
    await q.query(`
      INSERT INTO sections (class_id, code, label)
      SELECT c.id, s.code, c.grade_level::text || s.code
      FROM classes c CROSS JOIN (VALUES ('B'), ('C'), ('D'), ('E'), ('F'), ('G'), ('H')) AS s(code)
      WHERE c.grade_level = 1`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM sections`);
    await q.query(`DELETE FROM classes`);
    await q.query(`DELETE FROM assessment_categories`);
    for (const [table, trigger] of [
      ['audit_logs', 'trg_audit_logs_append_only'],
      ['exam_marks', 'trg_exam_marks_no_finalized_delete'],
      ['assessments', 'trg_assessments_no_finalized_delete'],
      ['enrollments', 'trg_enrollments_guard'],
      ['examinations', 'trg_examinations_guard'],
      ['exam_marks', 'trg_exam_marks_integrity'],
    ] as const) {
      await q.query(`DROP TRIGGER IF EXISTS ${trigger} ON ${table}`);
    }
    for (const fn of [
      'audit_logs_append_only',
      'forbid_finalized_delete',
      'enrollments_guard',
      'examinations_guard',
      'exam_marks_integrity',
    ]) {
      await q.query(`DROP FUNCTION IF EXISTS ${fn}()`);
    }
  }
}
