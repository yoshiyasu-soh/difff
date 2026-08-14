import { describe, it, expect } from 'vitest';
import { countChars } from '../../src/core/count.js';

describe('countChars', () => {
  it('returns all zeros for empty input', () => {
    expect(countChars('')).toEqual({ count1: 0, count2: 0, count3: 0, wordCount: 0 });
  });

  it('counts plain text with no whitespace', () => {
    expect(countChars('abc')).toEqual({ count1: 3, count2: 3, count3: 3, wordCount: 1 });
  });

  it('separates count1/count2/count3 for space and newline', () => {
    // 'a b\nc' : count3=5(CR除去後の全文字), count2=4(改行除去), count1=3(空白も除去)
    expect(countChars('a b\nc')).toEqual({ count1: 3, count2: 4, count3: 5, wordCount: 3 });
  });

  it('strips CR before counting count3', () => {
    // 'a\r\nb' -> CR除去で 'a\nb'(3文字)=count3, 改行除去で 'ab'(2文字)=count2=count1
    expect(countChars('a\r\nb')).toEqual({ count1: 2, count2: 2, count3: 3, wordCount: 2 });
  });
});
