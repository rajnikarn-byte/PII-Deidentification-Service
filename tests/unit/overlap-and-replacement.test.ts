import { describe, expect, it } from 'vitest';
import { resolveOverlaps } from '../../src/detection/overlap.js';
import type { EntitySpan } from '../../src/domain/entities.js';
import { replaceSpans } from '../../src/replacement/replacer.js';

const span = (type: EntitySpan['type'], start: number, end: number): EntitySpan => ({
  type,
  start,
  end,
});

describe('resolveOverlaps', () => {
  it('returns an empty list for no candidates', () => {
    expect(resolveOverlaps([])).toEqual([]);
  });

  it('keeps non-overlapping spans and sorts them by start', () => {
    const result = resolveOverlaps([span('PHONE', 20, 30), span('EMAIL', 0, 10)]);
    expect(result).toEqual([span('EMAIL', 0, 10), span('PHONE', 20, 30)]);
  });

  it('treats touching spans as non-overlapping', () => {
    const result = resolveOverlaps([span('SSN', 0, 5), span('PHONE', 5, 10)]);
    expect(result).toHaveLength(2);
  });

  it('prefers the longest candidate', () => {
    const result = resolveOverlaps([span('PHONE', 0, 12), span('EMAIL', 0, 24)]);
    expect(result).toEqual([span('EMAIL', 0, 24)]);
  });

  it('breaks length ties by entity priority', () => {
    const result = resolveOverlaps([span('PHONE', 0, 10), span('CREDIT_CARD', 0, 10)]);
    expect(result).toEqual([span('CREDIT_CARD', 0, 10)]);
  });

  it('breaks remaining ties by position', () => {
    const result = resolveOverlaps([span('PHONE', 2, 12), span('PHONE', 0, 10)]);
    expect(result).toEqual([span('PHONE', 0, 10)]);
  });

  it('collapses duplicates produced by different rules', () => {
    const result = resolveOverlaps([span('PHONE', 0, 15), span('PHONE', 0, 15)]);
    expect(result).toEqual([span('PHONE', 0, 15)]);
  });

  it('handles chains: A overlaps B, B overlaps C, A and C are disjoint', () => {
    const result = resolveOverlaps([span('PHONE', 0, 6), span('EMAIL', 4, 14), span('SSN', 12, 18)]);
    expect(result).toEqual([span('EMAIL', 4, 14)]);
  });

  it('keeps both outer spans when a shorter middle span overlaps them', () => {
    const result = resolveOverlaps([
      span('PHONE', 0, 10),
      span('IP_ADDRESS', 8, 14),
      span('SSN', 12, 22),
    ]);
    expect(result).toEqual([span('PHONE', 0, 10), span('SSN', 12, 22)]);
  });

  it('does not mutate its input', () => {
    const input = [span('PHONE', 5, 10), span('EMAIL', 0, 4)];
    const copy = [...input];
    resolveOverlaps(input);
    expect(input).toEqual(copy);
  });
});

describe('replaceSpans', () => {
  it('returns the text unchanged when there are no spans', () => {
    expect(replaceSpans('hello\r\nworld', [])).toBe('hello\r\nworld');
  });

  it('replaces spans with entity placeholders', () => {
    const text = 'a@b.co / 10.0.0.1';
    expect(replaceSpans(text, [span('EMAIL', 0, 6), span('IP_ADDRESS', 9, 17)])).toBe(
      '[EMAIL] / [IP_ADDRESS]',
    );
  });

  it('handles spans at both ends and adjacent spans', () => {
    expect(replaceSpans('XXYY', [span('SSN', 0, 2), span('PHONE', 2, 4)])).toBe('[SSN][PHONE]');
  });

  it('preserves surrounding Unicode and line breaks', () => {
    const text = '😀 x\nmañana';
    expect(replaceSpans(text, [span('EMAIL', 3, 4)])).toBe('😀 [EMAIL]\nmañana');
  });

  it('supports a custom placeholder resolver', () => {
    expect(replaceSpans('abc', [span('SSN', 1, 2)], (type) => `<${type.toLowerCase()}>`)).toBe(
      'a<ssn>c',
    );
  });

  it.each([
    ['overlapping', [span('SSN', 0, 3), span('PHONE', 2, 4)]],
    ['unsorted', [span('SSN', 2, 3), span('PHONE', 0, 1)]],
    ['empty', [span('SSN', 1, 1)]],
    ['out of bounds', [span('SSN', 0, 10)]],
  ])('rejects %s spans', (_label, spans) => {
    expect(() => replaceSpans('abcd', spans)).toThrow(RangeError);
  });
});
