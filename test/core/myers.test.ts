import { describe, it, expect } from 'vitest';
import { internTokens, diffTokens } from '../../src/core/myers.js';
import type { DiffOp } from '../../src/core/types.js';

function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function randSeq(rng: () => number, len: number, alphabet: number): number[] {
  return Array.from({ length: len }, () => Math.floor(rng() * alphabet));
}

function applyOps(a: number[], b: number[], ops: DiffOp[]): number[] {
  const out: number[] = [];
  for (const op of ops) {
    if (op.t === '=') for (let i = op.aLo; i < op.aHi; i++) out.push(a[i]);
    else if (op.t === '+') for (let i = op.bLo; i < op.bHi; i++) out.push(b[i]);
  }
  return out;
}

function editDistanceDP(a: number[], b: number[]): number {
  const n = a.length;
  const m = b.length;
  let prev = new Array<number>(m + 1);
  let cur = new Array<number>(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    for (let j = 1; j <= m; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : Math.min(prev[j], cur[j - 1]) + 1;
    }
    [prev, cur] = [cur, prev];
  }
  return prev[m];
}

function countEdits(ops: DiffOp[]): number {
  let d = 0;
  for (const op of ops) {
    if (op.t === '-') d += op.aHi - op.aLo;
    else if (op.t === '+') d += op.bHi - op.bLo;
  }
  return d;
}

describe('diffTokens (Myers)', () => {
  it('returns a single = op for identical sequences', () => {
    const { a, b } = internTokens(['x', 'y', 'z'], ['x', 'y', 'z']);
    expect(diffTokens(a, b)).toEqual([{ t: '=', aLo: 0, aHi: 3, bLo: 0, bHi: 3 }]);
  });

  it('returns a single - op when b is empty', () => {
    const { a, b } = internTokens(['x', 'y'], []);
    expect(diffTokens(a, b)).toEqual([{ t: '-', aLo: 0, aHi: 2, bLo: 0, bHi: 0 }]);
  });

  it('returns a single + op when a is empty', () => {
    const { a, b } = internTokens([], ['x', 'y']);
    expect(diffTokens(a, b)).toEqual([{ t: '+', aLo: 0, aHi: 0, bLo: 0, bHi: 2 }]);
  });

  it('produces a minimal, reconstructible edit script over 2000 random cases', () => {
    const rng = makeRng(12345);
    for (let trial = 0; trial < 2000; trial++) {
      const alphabet = 1 + Math.floor(rng() * 4);
      const aArr = randSeq(rng, Math.floor(rng() * 25), alphabet);
      const bArr = randSeq(rng, Math.floor(rng() * 25), alphabet);
      const { a, b } = internTokens(
        aArr.map(String),
        bArr.map(String)
      );
      const ops = diffTokens(a, b);

      const rebuilt = applyOps(Array.from(a), Array.from(b), ops);
      expect(rebuilt).toEqual(Array.from(b));

      const d = countEdits(ops);
      const ref = editDistanceDP(Array.from(a), Array.from(b));
      expect(d).toBe(ref);
    }
  });
});
