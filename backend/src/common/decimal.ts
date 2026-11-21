import type { ValueTransformer } from 'typeorm';

/** numeric columns are returned by pg as strings; this keeps them as JS numbers. */
export const numericTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | number | null | undefined) => (value === null || value === undefined ? null : Number(value)),
};

/** Marks are stored with 2 decimals. Work in hundredths to avoid binary floating point drift (0.1 + 0.2). */
export const toHundredths = (n: number): number => Math.round(n * 100);
export const fromHundredths = (h: number): number => h / 100;
export const round2 = (n: number): number => fromHundredths(toHundredths(n));

/** True when `n` has at most two decimal places. */
export const hasAtMostTwoDecimals = (n: number): boolean => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
