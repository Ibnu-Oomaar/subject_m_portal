import { describe, expect, test } from 'vitest';
import { fmtMarks, fmtPercent, markProblem, parseMark, plural } from './format';

describe('parseMark', () => {
  test('blank is "no value", never zero', () => {
    expect(parseMark('')).toBeNull();
    expect(parseMark('   ')).toBeNull();
  });
  test('0 is a real mark', () => {
    expect(parseMark('0')).toBe(0);
    expect(parseMark('0.0')).toBe(0);
  });
  test('accepts integers, decimals and a decimal comma', () => {
    expect(parseMark('9')).toBe(9);
    expect(parseMark(' 7.5 ')).toBe(7.5);
    expect(parseMark('7,5')).toBe(7.5);
  });
  test('anything else is NaN (invalid), not silently 0', () => {
    for (const bad of ['abc', '-1', '1e3', '1.', '.5', '1/2', '5 6', '--', '+3']) expect(parseMark(bad)).toBeNaN();
  });
});

describe('markProblem', () => {
  test('blank and valid values have no problem', () => {
    expect(markProblem('', 9)).toBeNull();
    expect(markProblem('0', 9)).toBeNull();
    expect(markProblem('9', 9)).toBeNull();
    expect(markProblem('8.75', 9)).toBeNull();
    expect(markProblem('1.10', 9)).toBeNull();
  });
  test('rejects text, values above the maximum and more than two decimals', () => {
    expect(markProblem('x', 9)).toBe('Enter a number');
    expect(markProblem('9.01', 9)).toBe('Maximum is 9');
    expect(markProblem('10', 9)).toBe('Maximum is 9');
    expect(markProblem('4.555', 9)).toBe('Use at most 2 decimals');
  });
  test('the maximum is whatever is passed in (it is never hardcoded)', () => {
    expect(markProblem('51', 50)).toBe('Maximum is 50');
    expect(markProblem('50', 50)).toBeNull();
    expect(markProblem('99.5', 100)).toBeNull();
    expect(markProblem('12.5', 12.5)).toBeNull();
    expect(markProblem('12.51', 12.5)).toBe('Maximum is 12.5');
  });
});

describe('formatting', () => {
  test('absent marks are an em dash, never 0', () => {
    expect(fmtMarks(null)).toBe('—');
    expect(fmtMarks(undefined)).toBe('—');
    expect(fmtMarks(0)).toBe('0');
    expect(fmtPercent(null)).toBe('—');
    expect(fmtPercent(0)).toBe('0%');
  });
  test('marks drop trailing zeros and keep at most two decimals', () => {
    expect(fmtMarks(8)).toBe('8');
    expect(fmtMarks(8.5)).toBe('8.5');
    expect(fmtMarks(8.456)).toBe('8.46');
  });
  test('percentages keep one decimal only when needed', () => {
    expect(fmtPercent(50)).toBe('50%');
    expect(fmtPercent(66.67)).toBe('66.7%');
    expect(fmtPercent(100)).toBe('100%');
    expect(fmtPercent(33.333, 2)).toBe('33.33%');
  });
  test('plural', () => {
    expect(plural(1, 'student')).toBe('1 student');
    expect(plural(0, 'student')).toBe('0 students');
    expect(plural(2, 'category', 'categories')).toBe('2 categories');
  });
});
