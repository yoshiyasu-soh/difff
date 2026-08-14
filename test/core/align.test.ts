import { describe, it, expect } from 'vitest';
import { buildRowPairs } from '../../src/core/align.js';
import { internTokens, diffTokens } from '../../src/core/myers.js';
import { tokenize } from '../../src/core/tokenize.js';
import type { DiffOp } from '../../src/core/types.js';

function diffOf(a: string, b: string) {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  const { a: ia, b: ib } = internTokens(tokensA, tokensB);
  const ops = diffTokens(ia, ib);
  return buildRowPairs(tokensA, tokensB, ops);
}

describe('buildRowPairs', () => {
  it('pairs identical multi-line text row by row with no <em>', () => {
    expect(diffOf('a\nb\n', 'a\nb\n')).toEqual([
      { a: 'a', b: 'a' },
      { a: 'b', b: 'b' },
    ]);
  });

  it('does not emit a trailing blank row when both texts end with a newline', () => {
    const rows = diffOf('a\n', 'a\n');
    expect(rows).toEqual([{ a: 'a', b: 'a' }]);
  });

  it('marks a fully deleted line and blank-pads the other side', () => {
    expect(diffOf('a\nb\nc\n', 'a\nc\n')).toEqual([
      { a: 'a', b: 'a' },
      { a: '<em>b</em>', b: '' },
      { a: 'c', b: 'c' },
    ]);
  });

  it('marks a fully inserted line and blank-pads the other side', () => {
    expect(diffOf('a\nc\n', 'a\nb\nc\n')).toEqual([
      { a: 'a', b: 'a' },
      { a: '', b: '<em>b</em>' },
      { a: 'c', b: 'c' },
    ]);
  });

  it('keeps a mid-row partial change on a single row pair', () => {
    // 'pXq' -> 'pq' (Xが削除)、2行目 'r' は共通
    // Note: Using hardcoded tokens to test the algorithm behavior
    // (automatic tokenization of 'pXq' vs 'pq' produces different token structures)
    const tokensA = ['p', 'X', 'q', '<$>', 'r'];
    const tokensB = ['p', 'q', '<$>', 'r'];
    const ops: DiffOp[] = [
      { t: '=', aLo: 0, aHi: 1, bLo: 0, bHi: 1 },
      { t: '-', aLo: 1, aHi: 2, bLo: 1, bHi: 1 },
      { t: '=', aLo: 2, aHi: 5, bLo: 1, bHi: 4 },
    ];
    expect(buildRowPairs(tokensA, tokensB, ops)).toEqual([
      { a: 'p<em>X</em>q', b: 'pq' },
      { a: 'r', b: 'r' },
    ]);
  });

  it('escapes runs of spaces immediately before </em>', () => {
    const tokensA = ['a', ' ', ' ', '<$>'];
    const tokensB = ['a', '<$>'];
    const ops: DiffOp[] = [
      { t: '=', aLo: 0, aHi: 1, bLo: 0, bHi: 1 },
      { t: '-', aLo: 1, aHi: 3, bLo: 1, bHi: 1 },
      { t: '=', aLo: 3, aHi: 4, bLo: 1, bHi: 2 },
    ];
    expect(buildRowPairs(tokensA, tokensB, ops)).toEqual([
      { a: 'a<em>&nbsp;&nbsp;</em>', b: 'a' },
    ]);
  });

  it('does not lose content when an asymmetric block replaces a single line with two lines', () => {
    const rows = diffOf('x\n', 'p\nq\n');
    const allA = rows.map((r) => r.a).join('');
    const allB = rows.map((r) => r.b).join('');
    expect(allA).toContain('x');
    expect(allB).toContain('p');
    expect(allB).toContain('q');
    expect(allA).toContain('<em>');
    expect(allB).toContain('<em>');
  });

  it('marks a fully deleted blank line instead of hiding it (final-review I-1)', () => {
    // 'a\n\n\nb' (空行2つ) vs 'a\n\nb' (空行1つ) — Aだけ空行が1つ多い
    const rows = diffOf('a\n\n\nb', 'a\n\nb');
    const allA = rows.map((r) => r.a).join('|');
    expect(allA).toContain('<em></em>');
  });

  it('does not collapse a real trailing blank-line diff into nothing (final-review I-1)', () => {
    // 'a\n\n\n' (末尾に空行2つ) vs 'a\n' (末尾に空行なし)
    const rows = diffOf('a\n\n\n', 'a\n');
    expect(rows.length).toBeGreaterThan(1);
    const allA = rows.map((r) => r.a).join('|');
    expect(allA).toContain('<em></em>');
  });

  it('still drops exactly one phantom trailing row when both texts end with a newline and have no other diff', () => {
    const rows = diffOf('a\n\n\n', 'a\n\n\n');
    expect(rows).toEqual([
      { a: 'a', b: 'a' },
      { a: '', b: '' },
      { a: '', b: '' },
    ]);
  });
});
