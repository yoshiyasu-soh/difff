import { tokenize } from './tokenize.js';
import { internTokens, diffTokens } from './myers.js';
import { buildRowPairs } from './align.js';
import { countChars } from './count.js';
import type { DiffResult } from './types.js';

export function computeDiff(rawA: string, rawB: string): DiffResult {
  const tokensA = tokenize(rawA);
  const tokensB = tokenize(rawB);
  const { a, b } = internTokens(tokensA, tokensB);
  const ops = diffTokens(a, b);
  const rows = buildRowPairs(tokensA, tokensB, ops);
  return {
    rows,
    statsA: countChars(rawA),
    statsB: countChars(rawB),
  };
}
