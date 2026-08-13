import { describe, it, expect } from 'vitest';
import { escapeChar, tokenize } from '../../src/core/tokenize.js';

describe('escapeChar', () => {
  it("escapes & < > ' \" ", () => {
    expect(escapeChar(`<a href="x">it's</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;it&#39;s&lt;/a&gt;'
    );
  });

  it('returns empty string for empty input', () => {
    expect(escapeChar('')).toBe('');
  });
});

describe('tokenize', () => {
  it('returns an empty array for empty input', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('groups consecutive lowercase letters into one token', () => {
    expect(tokenize('abc')).toEqual(['abc']);
  });

  it('breaks a run at an uppercase letter (original difff.pl behavior)', () => {
    expect(tokenize('aBc')).toEqual(['a', 'B', 'c']);
  });

  it('replaces newlines with a <$> marker token', () => {
    expect(tokenize('a' + String.fromCharCode(10) + 'b')).toEqual(['a', '<$>', 'b']);
  });

  it('keeps HTML entities produced by escaping as single tokens', () => {
    expect(tokenize('<b>')).toEqual(['&lt;', 'b', '&gt;']);
  });

  it('treats a lone digit as a single-character token', () => {
    expect(tokenize('5')).toEqual(['5']);
  });
});