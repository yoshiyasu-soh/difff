import type { CharCount } from './types.js';

export function countChars(rawText: string): CharCount {
  const wordMatches = rawText.match(/\S+/g);
  const wordCount = wordMatches ? wordMatches.length : 0;

  let t = rawText.replace(/\r/g, '');
  const count3 = [...t].length;

  t = t.replace(/\n/g, '');
  const count2 = [...t].length;

  t = t.replace(/\s/g, '');
  const count1 = [...t].length;

  return { count1, count2, count3, wordCount };
}
