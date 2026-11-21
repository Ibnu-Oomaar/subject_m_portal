/**
 * The four fixed assessment categories. Maximums are fixed by the specification (total 30) and are enforced
 * three times: here (API validation), by CHECK constraints on `assessments`, and by the seeded
 * `assessment_categories` table. A test asserts these three stay in sync.
 */
export const ASSESSMENT_CATEGORIES = [
  { code: 'class_activities', field: 'classActivities', name: 'Class Activities', maxMarks: 9, sortOrder: 1 },
  { code: 'homework_assignments', field: 'homeworkAssignments', name: 'Homeworks and Assignments', maxMarks: 6, sortOrder: 2 },
  {
    code: 'learning_materials_notebook',
    field: 'learningMaterialsNotebook',
    name: 'Learning Materials and Notebook',
    maxMarks: 10,
    sortOrder: 3,
  },
  { code: 'textbook', field: 'textbook', name: 'Textbook', maxMarks: 5, sortOrder: 4 },
] as const;

export type AssessmentField = (typeof ASSESSMENT_CATEGORIES)[number]['field'];
export const ASSESSMENT_FIELDS: readonly AssessmentField[] = ASSESSMENT_CATEGORIES.map((c) => c.field);
export const ASSESSMENT_MAX_TOTAL = ASSESSMENT_CATEGORIES.reduce((sum, c) => sum + c.maxMarks, 0);
export const ASSESSMENT_MAX_BY_FIELD = Object.fromEntries(
  ASSESSMENT_CATEGORIES.map((c) => [c.field, c.maxMarks]),
) as Record<AssessmentField, number>;
