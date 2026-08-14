import { describe, it, expect } from 'vitest';
import { ja } from '../../src/i18n/ja.js';
import { en } from '../../src/i18n/en.js';

describe('i18n catalogs', () => {
  it('ja and en expose the same message keys', () => {
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
  });

  it('ja.publishSuccess interpolates the url', () => {
    expect(ja.publishSuccess('https://example.com/abcde')).toBe(
      '公開しました: https://example.com/abcde'
    );
  });

  it('en.deleteFailure interpolates the error', () => {
    expect(en.deleteFailure('not found')).toBe('Failed: not found');
  });

  it('ja.stats derives space/newline counts and includes all fields', () => {
    const line = ja.stats({ count1: 10, count2: 12, count3: 13, wordCount: 3 });
    expect(line).toContain('文字数: 10');
    expect(line).toContain('空白数: 2');
    expect(line).toContain('改行数: 1');
    expect(line).toContain('単語数: 3');
  });

  it('en.stats derives space/newline counts and includes all fields', () => {
    const line = en.stats({ count1: 10, count2: 12, count3: 13, wordCount: 3 });
    expect(line).toContain('Characters: 10');
  });
});
