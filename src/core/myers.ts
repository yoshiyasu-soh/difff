import type { DiffOp } from './types.js';

export function internTokens(a: string[], b: string[]): { a: Int32Array; b: Int32Array } {
  const dict = new Map<string, number>();
  const encode = (arr: string[]): Int32Array => {
    const out = new Int32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      const tok = arr[i];
      let id = dict.get(tok);
      if (id === undefined) {
        id = dict.size;
        dict.set(tok, id);
      }
      out[i] = id;
    }
    return out;
  };
  return { a: encode(a), b: encode(b) };
}

/**
 * 線形空間版 Myers 差分アルゴリズム。
 * "An O(ND) Difference Algorithm and Its Variations" (Myers, 1986) の分割統治版。
 */
export function diffTokens(a: Int32Array, b: Int32Array): DiffOp[] {
  const maxSum = a.length + b.length;
  const offset = maxSum + 1;
  const vf = new Int32Array(2 * maxSum + 3);
  const vr = new Int32Array(2 * maxSum + 3);
  const out: DiffOp[] = [];

  function findMiddleSnake(aLo: number, aHi: number, bLo: number, bHi: number) {
    const n = aHi - aLo;
    const m = bHi - bLo;
    const delta = n - m;
    const odd = (delta & 1) !== 0;
    const max = Math.ceil((n + m) / 2);
    vf[offset + 1] = 0;
    vr[offset + 1] = 0;
    for (let d = 0; d <= max; d++) {
      for (let k = -d; k <= d; k += 2) {
        let x: number;
        if (k === -d || (k !== d && vf[offset + k - 1] < vf[offset + k + 1])) {
          x = vf[offset + k + 1];
        } else {
          x = vf[offset + k - 1] + 1;
        }
        let y = x - k;
        const x0 = x;
        const y0 = y;
        while (x < n && y < m && a[aLo + x] === b[bLo + y]) {
          x++;
          y++;
        }
        vf[offset + k] = x;
        if (odd && k >= delta - (d - 1) && k <= delta + (d - 1)) {
          if (x + vr[offset + delta - k] >= n) {
            return { x0: aLo + x0, y0: bLo + y0, x1: aLo + x, y1: bLo + y };
          }
        }
      }
      for (let k = -d; k <= d; k += 2) {
        let x: number;
        if (k === -d || (k !== d && vr[offset + k - 1] < vr[offset + k + 1])) {
          x = vr[offset + k + 1];
        } else {
          x = vr[offset + k - 1] + 1;
        }
        let y = x - k;
        const x0 = x;
        const y0 = y;
        while (x < n && y < m && a[aHi - 1 - x] === b[bHi - 1 - y]) {
          x++;
          y++;
        }
        vr[offset + k] = x;
        if (!odd && k >= delta - d && k <= delta + d) {
          if (x + vf[offset + delta - k] >= n) {
            return { x0: aHi - x, y0: bHi - y, x1: aHi - x0, y1: bHi - y0 };
          }
        }
      }
    }
    throw new Error('findMiddleSnake: unreachable');
  }

  function compare(aLo: number, aHi: number, bLo: number, bHi: number) {
    let p = 0;
    while (aLo + p < aHi && bLo + p < bHi && a[aLo + p] === b[bLo + p]) p++;
    if (p > 0) {
      out.push({ t: '=', aLo, aHi: aLo + p, bLo, bHi: bLo + p });
      aLo += p;
      bLo += p;
    }
    let s = 0;
    while (aHi - s > aLo && bHi - s > bLo && a[aHi - 1 - s] === b[bHi - 1 - s]) s++;
    const aMid = aHi - s;
    const bMid = bHi - s;

    if (aLo >= aMid && bLo >= bMid) {
      // 中央は空
    } else if (aLo >= aMid) {
      out.push({ t: '+', aLo, aHi: aLo, bLo, bHi: bMid });
    } else if (bLo >= bMid) {
      out.push({ t: '-', aLo, aHi: aMid, bLo, bHi: bLo });
    } else {
      const sn = findMiddleSnake(aLo, aMid, bLo, bMid);
      compare(aLo, sn.x0, bLo, sn.y0);
      if (sn.x1 > sn.x0) {
        out.push({ t: '=', aLo: sn.x0, aHi: sn.x1, bLo: sn.y0, bHi: sn.y1 });
      }
      compare(sn.x1, aMid, sn.y1, bMid);
    }
    if (s > 0) out.push({ t: '=', aLo: aMid, aHi, bLo: bMid, bHi });
  }

  compare(0, a.length, 0, b.length);
  return out;
}
