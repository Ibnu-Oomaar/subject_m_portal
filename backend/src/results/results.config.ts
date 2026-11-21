import type { ResultState } from '../common/types';

/**
 * Tunable rules for the results/analytics layer. Nothing here is a grading formula: the specification says
 * not to assume a combined final grade, so assessment and examination results are always kept separate.
 *
 * `performanceIndex` exists only so the teacher can spot students who excel, struggle, improve or decline.
 * It is an unweighted mean of the percentages of results that have actually been entered (missing results are
 * skipped, never counted as zero). A weighted or combined calculation can be introduced later by adding a new
 * strategy next to `meanOfTermMeans` in student-results.ts and selecting it here.
 */
export const RESULTS_CONFIG = {
  /** Which aggregation produces the monitoring index. */
  indexStrategy: 'mean-of-term-means' as const,
  thresholds: {
    /** index >= this -> "performing exceptionally well" */
    exceptionalMin: 85,
    /** index < this -> "low academic performance" */
    lowBelow: 50,
    /** index < this -> "requires additional support" */
    supportBelow: 40,
    /** a declining student below this index also "requires additional support" */
    decliningSupportBelow: 60,
    /** change of at least this many percentage points between the last two terms counts as a trend */
    trendBand: 5,
  },
  /** Result states a student may see on their own dashboard. */
  studentVisibleStates: ['entered', 'finalized'] as ResultState[],
} as const;

export type PerformanceThresholds = (typeof RESULTS_CONFIG)['thresholds'];
