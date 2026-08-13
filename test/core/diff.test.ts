import { describe, it, expect } from 'vitest';
import { computeDiff } from '../../src/core/diff.js';

describe('computeDiff', () => {
  it('combines tokenize + myers + align + count end to end', () => {
    const result = computeDiff('a\nb\nc\n', 'a\nc\n');
    expect(result.rows).toEqual([
      { a: 'a', b: 'a' },
      { a: '<em>b</em>', b: '' },
      { a: 'c', b: 'c' },
    ]);
    expect(result.statsA.wordCount).toBe(3);
    expect(result.statsB.wordCount).toBe(2);
  });

  it('returns no rows and zeroed stats for two empty strings', () => {
    const result = computeDiff('', '');
    expect(result.rows).toEqual([]);
    expect(result.statsA).toEqual({ count1: 0, count2: 0, count3: 0, wordCount: 0 });
  });
});
