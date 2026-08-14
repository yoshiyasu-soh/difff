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
});
