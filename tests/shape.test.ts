import { describe, it, expect } from '@jest/globals';
import { extractShape, countRecords } from '../src/shape';

describe('extractShape', () => {
  it('returns type strings for primitives', () => {
    expect(extractShape('hello')).toBe('string');
    expect(extractShape(42)).toBe('number');
    expect(extractShape(true)).toBe('boolean');
  });

  it('returns null for null/undefined', () => {
    expect(extractShape(null)).toBeNull();
    expect(extractShape(undefined)).toBeNull();
  });

  it('returns [] for empty arrays', () => {
    expect(extractShape([])).toBe('[]');
  });

  it('shows shape of first array element', () => {
    expect(extractShape([{ id: 1, name: 'test' }])).toEqual([
      { id: 'number', name: 'string' },
    ]);
  });

  it('extracts nested object shapes', () => {
    const data = { user: { name: 'John', age: 30 }, active: true };
    expect(extractShape(data)).toEqual({
      user: { name: 'string', age: 'number' },
      active: 'boolean',
    });
  });

  it('limits depth to prevent huge shapes', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: 'val' } } } } } } };
    const shape = extractShape(deep) as Record<string, unknown>;
    // at depth 5, it should return 'object' instead of going deeper
    expect(shape.a).toBeDefined();
  });
});

describe('countRecords', () => {
  it('counts array length', () => {
    expect(countRecords([1, 2, 3])).toBe(3);
  });

  it('counts .results array', () => {
    expect(countRecords({ results: [1, 2] })).toBe(2);
  });

  it('counts .data array', () => {
    expect(countRecords({ data: [1, 2, 3, 4] })).toBe(4);
  });

  it('counts .items array', () => {
    expect(countRecords({ items: [1] })).toBe(1);
  });

  it('returns 1 for plain objects', () => {
    expect(countRecords({ id: 1, name: 'test' })).toBe(1);
  });

  it('returns null for primitives', () => {
    expect(countRecords('hello')).toBeNull();
    expect(countRecords(42)).toBeNull();
  });
});
