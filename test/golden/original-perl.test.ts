import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeDiff } from '../../src/core/diff.js';

function findOriginalPerlScript(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    const candidate = join(dir, 'original-source', 'difff-master', 'difff.pl');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const PERL_SCRIPT = findOriginalPerlScript();

function hasPerl(): boolean {
  try {
    execFileSync('perl', ['-v']);
    return true;
  } catch {
    return false;
  }
}

function runOriginal(a: string, b: string): string {
  const query = `sequenceA=${encodeURIComponent(a)}&sequenceB=${encodeURIComponent(b)}`;
  return execFileSync('perl', [PERL_SCRIPT!], {
    env: { ...process.env, QUERY_STRING: query },
    encoding: 'utf-8',
  });
}

function extractEmContents(html: string): string[] {
  const tableMatch = html.match(/<div id=result>[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) throw new Error('result table not found in perl output');
  return [...tableMatch[1].matchAll(/<em>([\s\S]*?)<\/em>/g)].map((m) => m[1]);
}

function extractOurEmContents(rows: { a: string; b: string }[]): string[] {
  return rows.flatMap((r) => [
    ...[...r.a.matchAll(/<em>([\s\S]*?)<\/em>/g)].map((m) => m[1]),
    ...[...r.b.matchAll(/<em>([\s\S]*?)<\/em>/g)].map((m) => m[1]),
  ]);
}

describe.skipIf(!hasPerl() || PERL_SCRIPT === null)('golden test vs original difff.pl', () => {
  const cases: Array<[string, string, string]> = [
    ['single word substitution', 'the quick brown fox', 'the quick red fox'],
    ['single word insertion', 'the fox jumps', 'the quick fox jumps'],
    ['single word deletion', 'the quick fox jumps', 'the fox jumps'],
  ];

  for (const [label, a, b] of cases) {
    it(`matches marked substrings for: ${label}`, () => {
      const originalHtml = runOriginal(a, b);
      const ours = computeDiff(a, b);
      expect(extractOurEmContents(ours.rows)).toEqual(extractEmContents(originalHtml));
    });
  }
});
