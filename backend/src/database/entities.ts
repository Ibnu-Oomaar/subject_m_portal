import { AcademicYear } from '../academic-years/academic-year.entity';
import { AssessmentCategory } from '../assessments/assessment-category.entity';
import { AssessmentRecord } from '../assessments/assessment-record.entity';
import { SchoolClass } from '../classes/class.entity';
import { ExamMark } from '../examinations/exam-mark.entity';
import { Examination } from '../examinations/examination.entity';
import { Section } from '../sections/section.entity';
import { AuditLog } from '../security/audit-log.entity';
import { Enrollment } from '../students/enrollment.entity';
import { Student } from '../students/student.entity';
import { TeacherSection } from '../teachers/teacher-section.entity';
import { Teacher } from '../teachers/teacher.entity';

export const entities = [
  SchoolClass,
  Section,
  Teacher,
  TeacherSection,
  AcademicYear,
  Student,
  Enrollment,
  AssessmentCategory,
  AssessmentRecord,
  Examination,
  ExamMark,
  AuditLog,
];
