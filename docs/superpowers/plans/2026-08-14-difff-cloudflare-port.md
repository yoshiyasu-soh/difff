# difff Cloudflare Workers 移植 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Perl CGI 版 difff《ﾃﾞｭﾌﾌ》を、差分計算をブラウザ（Web Worker）で行い、公開/削除機能を Workers KV で行う Cloudflare Workers アプリとして再構築する。

**Architecture:** プラットフォーム非依存の差分エンジン（`src/core/`）を core とし、ブラウザ側 UI（`src/client/`）と Cloudflare Worker（`src/worker/`）の両方から利用する。Worker は静的アセット配信・KV への保存/削除・公開ページの外殻返却のみを担当し、差分計算は一切行わない。

**Tech Stack:** TypeScript, Vite（クライアントビルド）, Wrangler（Worker ビルド・デプロイ）, Vitest（ユニットテスト）, `@cloudflare/vitest-pool-workers`（KV を含む Worker テスト）, Playwright（E2E）。ランタイム依存ライブラリなし（Web Crypto API のみ使用）。

**Spec:** [docs/superpowers/specs/2026-08-14-difff-cloudflare-design.md](../specs/2026-08-14-difff-cloudflare-design.md)

## Global Constraints

- 差分計算はクライアント側（ブラウザの Web Worker）で行う。Cloudflare Worker は差分計算を一切行わない。
- 公開データの保存先は Workers KV、TTL は 259200 秒（3日）。
- 公開ID は5文字、文字セットは `a-k, m, n, p-z, 2-9`（0, o, 1, l を除外、32種）。
- 保存時の入力上限は sequenceA + sequenceB 合計 200,000 文字。
- 削除パスワードはソルト付き SHA-256（Web Crypto `crypto.subtle`）で保持する。PBKDF2 等の反復ハッシュは使わない。
- 削除は明示的な `id` パラメータで対象を特定する（`HTTP_REFERER` には依存しない）。
- トークン化・エスケープ・差分検出ロジックはオリジナル `difff.pl` に忠実に再現する。`[a-z]+` が小文字のみをまとめる挙動（例: `Betty` → `B`+`etty`）も維持する。
- ホスティング構成は Workers 単体 + Static Assets（`wrangler.jsonc` の `assets` 設定）。Pages は使わない。
- 日英両対応を維持する。ロジックは共通、文言のみ `src/i18n/` のメッセージカタログで差し替える。

---

## ファイル構成の全体像

```
app/
├── src/
│   ├── core/
│   │   ├── types.ts
│   │   ├── tokenize.ts
│   │   ├── myers.ts
│   │   ├── align.ts
│   │   ├── count.ts
│   │   └── diff.ts
│   ├── client/
│   │   ├── main.ts
│   │   ├── render.ts
│   │   ├── diff.worker.ts
│   │   └── public/
│   │       ├── index.html
│   │       ├── style.css
│   │       └── en/index.html
│   ├── worker/
│   │   ├── index.ts
│   │   ├── save.ts
│   │   ├── delete.ts
│   │   └── page.ts
│   └── i18n/
│       ├── messages.ts
│       ├── ja.ts
│       └── en.ts
├── test/
│   ├── core/
│   ├── client/
│   ├── i18n/
│   ├── golden/
│   ├── worker/
│   └── e2e/
├── wrangler.jsonc
├── vite.config.ts
├── vitest.config.ts
├── tsconfig.json
└── package.json
```

---

### Task 1: プロジェクトスキャフォールディング

**Files:**
- Create: `app/package.json`
- Create: `app/tsconfig.json`
- Create: `app/vitest.config.ts`
- Create: `app/.gitignore`
- Create: `app/wrangler.jsonc`

**Interfaces:**
- Produces: npm scripts `test`, `typecheck`, `build`, `dev`, `deploy`（後続タスクが呼び出す）。

- [ ] **Step 1: package.json を作成**

```json
{
  "name": "difff",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "build": "vite build",
    "test": "vitest run --config vitest.config.ts",
    "pretest:worker": "vite build",
    "test:worker": "vitest run --config test/worker/vitest.config.ts",
    "test:e2e": "playwright test",
    "typecheck": "tsc --noEmit",
    "deploy": "vite build && wrangler deploy"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.7.0",
    "@cloudflare/workers-types": "^4.20250801.0",
    "@playwright/test": "^1.47.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0",
    "wrangler": "^3.80.0"
  }
}
```

- [ ] **Step 2: tsconfig.json を作成**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["@cloudflare/workers-types", "vitest/globals"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: vitest.config.ts（core/client/i18n/golden 用）を作成**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: [
      'test/core/**/*.test.ts',
      'test/client/**/*.test.ts',
      'test/i18n/**/*.test.ts',
      'test/golden/**/*.test.ts',
    ],
  },
});
```

- [ ] **Step 4: .gitignore を作成**

```
node_modules/
dist/
.wrangler/
*.log
```

- [ ] **Step 5: wrangler.jsonc の初期スケルトンを作成（KVは後続タスクで追加）**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "difff",
  "main": "src/worker/index.ts",
  "compatibility_date": "2026-08-01",
  "assets": {
    "directory": "./dist/client",
    "binding": "ASSETS"
  }
}
```

- [ ] **Step 6: 依存関係をインストールし、型チェックが通ることを確認**

```bash
cd app
npm install
npm run typecheck
```

Expected: `npm install` が成功し、`npm run typecheck` はエラーなく終了する（`src`/`test` が空でも成功する）。

もし特定バージョンが npm レジストリから取得できない場合は、`npm view <package> versions` で利用可能な最新版に読み替えてインストールする。

- [ ] **Step 7: コミット**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore wrangler.jsonc package-lock.json
git commit -m "chore: scaffold difff Cloudflare Workers project"
```

---

### Task 2: core/types.ts + core/tokenize.ts

**Files:**
- Create: `app/src/core/types.ts`
- Create: `app/src/core/tokenize.ts`
- Test: `app/test/core/tokenize.test.ts`

**Interfaces:**
- Produces:
  - `export interface DiffOp { t: '=' | '-' | '+'; aLo: number; aHi: number; bLo: number; bHi: number }`
  - `export interface CharCount { count1: number; count2: number; count3: number; wordCount: number }`
  - `export interface RowPair { a: string; b: string }`
  - `export interface DiffResult { rows: RowPair[]; statsA: CharCount; statsB: CharCount }`
  - `export function escapeChar(raw: string): string`
  - `export function tokenize(raw: string): string[]`

- [ ] **Step 1: types.ts を作成**

```ts
export interface DiffOp {
  t: '=' | '-' | '+';
  aLo: number;
  aHi: number;
  bLo: number;
  bHi: number;
}

export interface CharCount {
  count1: number; // 空白・改行を除いた文字数
  count2: number; // 空白込み文字数（改行を除く）
  count3: number; // 改行込み文字数
  wordCount: number;
}

export interface RowPair {
  a: string; // 左セルのHTML（エスケープ済み・<em>付与済み）
  b: string; // 右セルのHTML
}

export interface DiffResult {
  rows: RowPair[];
  statsA: CharCount;
  statsB: CharCount;
}
```

- [ ] **Step 2: 失敗するテストを書く**

`app/test/core/tokenize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { escapeChar, tokenize } from '../../src/core/tokenize.js';

describe('escapeChar', () => {
  it('escapes & < > \' " ', () => {
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
    expect(tokenize('a\nb')).toEqual(['a', '<$>', 'b']);
  });

  it('keeps HTML entities produced by escaping as single tokens', () => {
    expect(tokenize('<b>')).toEqual(['&lt;', 'b', '&gt;']);
  });

  it('treats a lone digit as a single-character token', () => {
    expect(tokenize('5')).toEqual(['5']);
  });
});
```

- [ ] **Step 3: テストが失敗することを確認**

```bash
npm test -- test/core/tokenize.test.ts
```

Expected: `Cannot find module '../../src/core/tokenize.js'` で FAIL。

- [ ] **Step 4: tokenize.ts を実装**

```ts
export function escapeChar(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;');
}

// [a-z]+ | <$> | 実体参照 | 任意の1文字（コードポイント単位）
const TOKEN_RE = /[a-z]+|<\$>|&#?\w+;|[\s\S]/gu;

export function tokenize(raw: string): string[] {
  const escaped = escapeChar(raw).replace(/\n/g, '<$>');
  return escaped.match(TOKEN_RE) ?? [];
}
```

- [ ] **Step 5: テストが通ることを確認**

```bash
npm test -- test/core/tokenize.test.ts
```

Expected: 全テストが PASS。

- [ ] **Step 6: コミット**

```bash
git add src/core/types.ts src/core/tokenize.ts test/core/tokenize.test.ts
git commit -m "feat: add tokenizer for the diff engine"
```

---

### Task 3: core/myers.ts（線形空間 Myers 差分アルゴリズム）

**Files:**
- Create: `app/src/core/myers.ts`
- Test: `app/test/core/myers.test.ts`

**Interfaces:**
- Consumes: `DiffOp`（`src/core/types.ts`）
- Produces:
  - `export function internTokens(a: string[], b: string[]): { a: Int32Array; b: Int32Array }`
  - `export function diffTokens(a: Int32Array, b: Int32Array): DiffOp[]`

- [ ] **Step 1: 失敗するテストを書く**

`app/test/core/myers.test.ts`:

```ts
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
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npm test -- test/core/myers.test.ts
```

Expected: `Cannot find module '../../src/core/myers.js'` で FAIL。

- [ ] **Step 3: myers.ts を実装**

```ts
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
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npm test -- test/core/myers.test.ts
```

Expected: 全テストが PASS（2000ケースの property-based テストを含む）。

- [ ] **Step 5: コミット**

```bash
git add src/core/myers.ts test/core/myers.test.ts
git commit -m "feat: add linear-space Myers diff algorithm"
```

---

### Task 4: core/count.ts（文字数・単語数カウント）

**Files:**
- Create: `app/src/core/count.ts`
- Test: `app/test/core/count.test.ts`

**Interfaces:**
- Consumes: `CharCount`（`src/core/types.ts`）
- Produces: `export function countChars(rawText: string): CharCount`

- [ ] **Step 1: 失敗するテストを書く**

`app/test/core/count.test.ts`:

```ts
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
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npm test -- test/core/count.test.ts
```

Expected: `Cannot find module '../../src/core/count.js'` で FAIL。

- [ ] **Step 3: count.ts を実装**

```ts
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
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npm test -- test/core/count.test.ts
```

Expected: 全テストが PASS。

- [ ] **Step 5: コミット**

```bash
git add src/core/count.ts test/core/count.test.ts
git commit -m "feat: add character/word counting"
```

---

### Task 5: core/align.ts（行ペア構築・<em>マーキング）

**Files:**
- Create: `app/src/core/align.ts`
- Test: `app/test/core/align.test.ts`

**Interfaces:**
- Consumes: `DiffOp`, `RowPair`（`src/core/types.ts`）
- Produces: `export function buildRowPairs(tokensA: string[], tokensB: string[], ops: DiffOp[]): RowPair[]`

- [ ] **Step 1: 失敗するテストを書く**

`app/test/core/align.test.ts`:

```ts
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
    expect(diffOf('pXq\nr', 'pq\nr')).toEqual([
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
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npm test -- test/core/align.test.ts
```

Expected: `Cannot find module '../../src/core/align.js'` で FAIL。

- [ ] **Step 3: align.ts を実装**

```ts
import type { DiffOp, RowPair } from './types.js';

const NEWLINE = '<$>';

/**
 * Myers の ops から左右の行ペアを構築する。
 *
 * オリジナル difff.pl は diff コマンドの出力を後処理して <$> を複製する
 * ことで左右の改行数を揃えていたが（条件次第でずれることがある）、
 * ここでは ops を直接持っているため、変更ブロックの行をグループ化して
 * 短い方を空白セルで埋める、より堅牢な方式で構築する。
 */
export function buildRowPairs(tokensA: string[], tokensB: string[], ops: DiffOp[]): RowPair[] {
  const output: RowPair[] = [];
  let curA = '';
  let curB = '';
  let emOpenA = false;
  let emOpenB = false;
  let pendingA: string[] = [];
  let pendingB: string[] = [];

  const closeEmA = () => {
    if (emOpenA) {
      curA += '</em>';
      emOpenA = false;
    }
  };
  const closeEmB = () => {
    if (emOpenB) {
      curB += '</em>';
      emOpenB = false;
    }
  };

  // 変更ブロック内で完成済みの行（pendingA/B）だけを対にして出力する。
  // curA/curB（まだ改行に到達していない進行中の行）には触れない。
  const flushPendingOnly = () => {
    if (pendingA.length === 0 && pendingB.length === 0) return;
    const n = Math.max(pendingA.length, pendingB.length);
    for (let i = 0; i < n; i++) {
      output.push({
        a: applySpaceEscape(pendingA[i] ?? ''),
        b: applySpaceEscape(pendingB[i] ?? ''),
      });
    }
    pendingA = [];
    pendingB = [];
  };

  // 共通の改行（同期点）に到達したときに呼ぶ。進行中の行を確定してから、
  // ブロック全体をまとめて出力する。
  const flushSync = () => {
    closeEmA();
    closeEmB();
    pendingA.push(curA);
    pendingB.push(curB);
    curA = '';
    curB = '';
    flushPendingOnly();
  };

  for (const op of ops) {
    if (op.t === '=') {
      // 直前の変更ブロックで完成済みの行があれば、共通部分に入る前に確定する。
      flushPendingOnly();
      closeEmA();
      closeEmB();
      for (let i = op.aLo; i < op.aHi; i++) {
        const tok = tokensA[i];
        if (tok === NEWLINE) {
          flushSync();
        } else {
          curA += tok;
          curB += tok;
        }
      }
    } else if (op.t === '-') {
      for (let i = op.aLo; i < op.aHi; i++) {
        const tok = tokensA[i];
        if (tok === NEWLINE) {
          closeEmA();
          pendingA.push(curA);
          curA = '';
        } else {
          if (!emOpenA) {
            curA += '<em>';
            emOpenA = true;
          }
          curA += tok;
        }
      }
    } else {
      for (let i = op.bLo; i < op.bHi; i++) {
        const tok = tokensB[i];
        if (tok === NEWLINE) {
          closeEmB();
          pendingB.push(curB);
          curB = '';
        } else {
          if (!emOpenB) {
            curB += '<em>';
            emOpenB = true;
          }
          curB += tok;
        }
      }
    }
  }

  flushSync(); // 末尾の行を確定

  // 末尾の完全な空行（両テキストが改行で終わる場合に発生）を取り除く。
  while (
    output.length > 0 &&
    output[output.length - 1].a === '' &&
    output[output.length - 1].b === ''
  ) {
    output.pop();
  }

  return output;
}

function applySpaceEscape(s: string): string {
  return s.replace(/ +<\/em>/g, (m) => m.replace(/ /g, '&nbsp;'));
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npm test -- test/core/align.test.ts
```

Expected: 全テストが PASS。

- [ ] **Step 5: コミット**

```bash
git add src/core/align.ts test/core/align.test.ts
git commit -m "feat: build aligned row pairs from diff ops"
```

---

### Task 6: core/diff.ts（オーケストレータ）

**Files:**
- Create: `app/src/core/diff.ts`
- Test: `app/test/core/diff.test.ts`

**Interfaces:**
- Consumes: `tokenize`（Task 2）, `internTokens`/`diffTokens`（Task 3）, `buildRowPairs`（Task 5）, `countChars`（Task 4）
- Produces: `export function computeDiff(rawA: string, rawB: string): DiffResult`

- [ ] **Step 1: 失敗するテストを書く**

`app/test/core/diff.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeDiff } from '../../src/core/diff.js';

describe('computeDiff', () => {
  it('combines tokenize + myers + align + count end to end', () => {
    const result = computeDiff('a\nb\nc\n', 'a\nc\n');
    expect(result.rows).toEqual([
      { a: 'a', b: 'a' },
      { a: '<em>b</em>', b: '' },
      { a: 'c', b: 'c' },
    ]);
    expect(result.statsA.wordCount).toBe(3);
    expect(result.statsB.wordCount).toBe(2);
  });

  it('returns no rows and zeroed stats for two empty strings', () => {
    const result = computeDiff('', '');
    expect(result.rows).toEqual([]);
    expect(result.statsA).toEqual({ count1: 0, count2: 0, count3: 0, wordCount: 0 });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npm test -- test/core/diff.test.ts
```

Expected: `Cannot find module '../../src/core/diff.js'` で FAIL。

- [ ] **Step 3: diff.ts を実装**

```ts
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
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npm test -- test/core/diff.test.ts
```

Expected: 全テストが PASS。

- [ ] **Step 5: コミット**

```bash
git add src/core/diff.ts test/core/diff.test.ts
git commit -m "feat: add computeDiff orchestrator"
```

---

### Task 7: オリジナル Perl 版とのゴールデンテスト

**Files:**
- Create: `app/test/golden/original-perl.test.ts`

**Interfaces:**
- Consumes: `computeDiff`（Task 6）
- 外部コマンド `perl` を `child_process.execFileSync` で呼び出し、`original-source/difff-master/difff.pl` を直接実行する。

**背景:** 設計書の注記①の通り、Myers 法と GNU diff は同じ最小編集距離でも異なる編集手順を選ぶことがある。このテストは曖昧さのない単純なケース（一意な最小編集経路を持つケース）に絞って一致を確認する。

- [ ] **Step 1: テストファイルを作成**

`app/test/golden/original-perl.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { computeDiff } from '../../src/core/diff.js';

const PERL_SCRIPT = fileURLToPath(
  new URL('../../../original-source/difff-master/difff.pl', import.meta.url)
);

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
  return execFileSync('perl', [PERL_SCRIPT], {
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

describe.skipIf(!hasPerl())('golden test vs original difff.pl', () => {
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
```

- [ ] **Step 2: テストを実行して確認**

```bash
npm test -- test/golden/original-perl.test.ts
```

Expected: `perl` が利用可能な環境では3ケースとも PASS。`perl` が無い環境では `describe.skipIf` によりスキップされる（FAIL にはならない）。

もし特定のケースで `<em>` の中身が一致しない場合、それは設計書の注記①で想定済みの Myers 法と GNU diff の経路差である可能性が高い。差異の内容を確認し、意味的に妥当（同じ最小編集距離で異なる境界の選び方をしているだけ）であれば、そのケースをテストから除外してコメントで理由を記録する。もし文字数・行数が食い違うなど明らかなバグであれば、Task 3/5 の実装を見直す。

- [ ] **Step 3: コミット**

```bash
git add test/golden/original-perl.test.ts
git commit -m "test: add golden comparison against original difff.pl"
```

---

### Task 8: client/render.ts（DOM描画・統計行フォーマット）

**Files:**
- Create: `app/src/client/render.ts`
- Test: `app/test/client/render.test.ts`

**Interfaces:**
- Consumes: `DiffResult`, `CharCount`（`src/core/types.ts`）
- Produces:
  - `export function renderResultTable(table: HTMLTableElement, result: DiffResult): void`
  - `export function formatStatsLine(stats: CharCount): string`

- [ ] **Step 1: 失敗するテストを書く**

`app/test/client/render.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderResultTable, formatStatsLine } from '../../src/client/render.js';
import type { DiffResult } from '../../src/core/types.js';

describe('renderResultTable', () => {
  it('creates one <tr> with two <td> per row', () => {
    const table = document.createElement('table');
    const result: DiffResult = {
      rows: [
        { a: 'x', b: 'y' },
        { a: '<em>z</em>', b: '' },
      ],
      statsA: { count1: 1, count2: 1, count3: 1, wordCount: 1 },
      statsB: { count1: 1, count2: 1, count3: 1, wordCount: 1 },
    };
    renderResultTable(table, result);
    expect(table.rows.length).toBe(2);
    expect(table.rows[0].cells[0].textContent).toBe('x');
    expect(table.rows[1].cells[0].querySelector('em')?.textContent).toBe('z');
  });

  it('clears previous content before rendering', () => {
    const table = document.createElement('table');
    table.innerHTML = '<tr><td>stale</td></tr>';
    renderResultTable(table, {
      rows: [{ a: 'fresh', b: 'fresh' }],
      statsA: { count1: 5, count2: 5, count3: 5, wordCount: 1 },
      statsB: { count1: 5, count2: 5, count3: 5, wordCount: 1 },
    });
    expect(table.rows.length).toBe(1);
    expect(table.textContent).not.toContain('stale');
  });
});

describe('formatStatsLine', () => {
  it('derives space and newline counts from the cumulative totals', () => {
    const line = formatStatsLine({ count1: 10, count2: 12, count3: 13, wordCount: 3 });
    expect(line).toContain('文字数: 10');
    expect(line).toContain('空白数: 2');
    expect(line).toContain('改行数: 1');
    expect(line).toContain('単語数: 3');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npm test -- test/client/render.test.ts
```

Expected: `Cannot find module '../../src/client/render.js'` で FAIL。

- [ ] **Step 3: render.ts を実装**

```ts
import type { CharCount, DiffResult } from '../core/types.js';

export function renderResultTable(table: HTMLTableElement, result: DiffResult): void {
  table.innerHTML = '';
  for (const row of result.rows) {
    const tr = document.createElement('tr');
    const tdA = document.createElement('td');
    tdA.innerHTML = row.a;
    const tdB = document.createElement('td');
    tdB.innerHTML = row.b;
    tr.append(tdA, tdB);
    table.append(tr);
  }
}

export function formatStatsLine(stats: CharCount): string {
  const spaces = stats.count2 - stats.count1;
  const newlines = stats.count3 - stats.count2;
  return `文字数: ${stats.count1} / 空白数: ${spaces} (空白込み: ${stats.count2}) / 改行数: ${newlines} (改行込み: ${stats.count3}) / 単語数: ${stats.wordCount}`;
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npm test -- test/client/render.test.ts
```

Expected: 全テストが PASS。

- [ ] **Step 5: コミット**

```bash
git add src/client/render.ts test/client/render.test.ts
git commit -m "feat: add client-side result table rendering"
```

---

### Task 9: クライアント Worker・静的シェル・ビルド設定

**Files:**
- Create: `app/src/client/diff.worker.ts`
- Create: `app/src/client/public/index.html`
- Create: `app/src/client/public/en/index.html`
- Create: `app/src/client/public/style.css`
- Create: `app/vite.config.ts`
- Create: `app/src/client/main.ts`（このタスクでは仮スタブのみ。実装は Task 10/11）

**Interfaces:**
- Consumes: `computeDiff`（Task 6）
- Produces: `diff.worker.ts` は `postMessage({a, b})` を受け取り `{ok:true, result: DiffResult}` または `{ok:false, error:string}` を返す。

**このタスクにテストはない。** `diff.worker.ts` は `computeDiff`（既にテスト済み）を Web Worker のメッセージングでラップするだけの薄い glue コードであり、実際の Worker 実行環境（`self`/`postMessage`）は jsdom では再現できない。動作確認は Task 17 の E2E テストで行う。

- [ ] **Step 1: diff.worker.ts を作成**

```ts
/// <reference lib="webworker" />
import { computeDiff } from '../core/diff.js';
import type { DiffResult } from '../core/types.js';

export type WorkerRequest = { a: string; b: string };
export type WorkerResponse = { ok: true; result: DiffResult } | { ok: false; error: string };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { a, b } = event.data;
  try {
    const result = computeDiff(a, b);
    const response: WorkerResponse = { ok: true, result };
    (self as unknown as Worker).postMessage(response);
  } catch (err) {
    const response: WorkerResponse = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(response);
  }
};
```

- [ ] **Step 2: style.css を作成**

```css
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --fg: #1a1a1a;
  --border: #d0d0d0;
  --accent: #0077cc;
  --em-bg-1: #99eeff;
  --em-border-1: #00bbff;
  --em-bg-2: #99ff99;
  --em-bg-3: #000000;
  --em-fg-3: #ffffff;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1a1a1a;
    --fg: #e8e8e8;
    --border: #444444;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 1rem;
  background: var(--bg);
  color: var(--fg);
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  line-height: 1.6;
}

header#top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  border-bottom: 4px solid var(--accent);
  padding-bottom: 0.5rem;
  margin-bottom: 1rem;
}

header#top a {
  color: inherit;
  text-decoration: none;
}

.panes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

@media (max-width: 700px) {
  .panes {
    grid-template-columns: 1fr;
  }
}

textarea {
  width: 100%;
  font-family: inherit;
  padding: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--fg);
}

.actions {
  margin-top: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

button {
  padding: 0.5rem 1.25rem;
  border-radius: 4px;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: #fff;
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: default;
}

table#result-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  margin-top: 1rem;
}

table#result-table td {
  border: 1px solid var(--border);
  padding: 0.4rem 0.75rem;
  word-wrap: break-word;
  vertical-align: top;
}

em {
  font-style: normal;
}

body[data-color-scheme='1'] em,
body:not([data-color-scheme]) em {
  background: var(--em-bg-1);
  border: 1px solid var(--em-border-1);
  font-weight: bold;
}

body[data-color-scheme='2'] em {
  background: var(--em-bg-2);
  font-weight: bold;
}

body[data-color-scheme='3'] em {
  background: var(--em-bg-3);
  color: var(--em-fg-3);
  font-weight: bold;
}

.result-controls {
  margin-top: 0.75rem;
  display: flex;
  gap: 1rem;
  align-items: center;
}

@media print {
  #difff-form,
  .actions,
  #publish,
  #delete-page {
    display: none !important;
  }
}
```

- [ ] **Step 3: index.html（日本語版）を作成**

```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>difff《ﾃﾞｭﾌﾌ》- テキスト比較ツール</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header id="top">
  <h1><a href="/">difff《ﾃﾞｭﾌﾌ》</a></h1>
  <nav>
    <a href="/en/">English</a>
  </nav>
</header>

<main>
  <form id="difff-form">
    <p>下の枠に比較したい文章を入れてください。差分 (diff) を表示します。</p>
    <div class="panes">
      <textarea id="sequenceA" name="sequenceA" rows="20" placeholder="テキストA"></textarea>
      <textarea id="sequenceB" name="sequenceB" rows="20" placeholder="テキストB"></textarea>
    </div>
    <div class="actions">
      <button type="submit" id="compare-btn">比較する</button>
      <button type="button" id="cancel-btn" hidden>キャンセル</button>
      <span id="progress" hidden>計算中…</span>
    </div>
  </form>

  <section id="result" hidden>
    <table id="result-table" cellspacing="0"></table>
    <p id="stats-a"></p>
    <p id="stats-b"></p>
    <div class="result-controls">
      <button type="button" id="hide-form-btn">結果のみ表示 (印刷用)</button>
      <label><input type="radio" name="color" value="1" checked> カラー1</label>
      <label><input type="radio" name="color" value="2"> カラー2</label>
      <label><input type="radio" name="color" value="3"> モノクロ</label>
    </div>
  </section>

  <section id="publish">
    <h2>この結果を公開する</h2>
    <p>この結果を保存し、公開用のURLを発行します。削除パスワードを設定しておけば、あとで消すこともできます。<br>
    <strong>公開期間は3日間です。</strong></p>
    <label>削除パスワード: <input type="password" id="publish-passwd"></label>
    <button type="button" id="publish-btn">結果を公開する</button>
    <p id="publish-result" hidden></p>
  </section>

  <section id="delete-page" hidden>
    <h2>このページを削除する</h2>
    <label>削除パスワード: <input type="password" id="delete-passwd"></label>
    <button type="button" id="delete-btn">削除する</button>
    <p id="delete-result" hidden></p>
  </section>
</main>

<script type="module" src="/main.js"></script>
</body>
</html>
```

- [ ] **Step 4: en/index.html（英語版）を作成**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>difff - online text compare</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header id="top">
  <h1><a href="/en/">difff</a></h1>
  <nav>
    <a href="/">Japanese</a>
  </nav>
</header>

<main>
  <form id="difff-form">
    <p>Input two texts below and click 'compare':</p>
    <div class="panes">
      <textarea id="sequenceA" name="sequenceA" rows="20" placeholder="Text A"></textarea>
      <textarea id="sequenceB" name="sequenceB" rows="20" placeholder="Text B"></textarea>
    </div>
    <div class="actions">
      <button type="submit" id="compare-btn">compare</button>
      <button type="button" id="cancel-btn" hidden>cancel</button>
      <span id="progress" hidden>computing…</span>
    </div>
  </form>

  <section id="result" hidden>
    <table id="result-table" cellspacing="0"></table>
    <p id="stats-a"></p>
    <p id="stats-b"></p>
    <div class="result-controls">
      <button type="button" id="hide-form-btn">Hide form (print friendly)</button>
      <label><input type="radio" name="color" value="1" checked> Color 1</label>
      <label><input type="radio" name="color" value="2"> Color 2</label>
      <label><input type="radio" name="color" value="3"> Black &amp; White</label>
    </div>
  </section>

  <section id="publish">
    <h2>Create public link</h2>
    <p>You can make a public link and share this result.<br>
    Public link will expire in <strong>three days</strong>.</p>
    <label>Set password: <input type="password" id="publish-passwd"></label>
    <button type="button" id="publish-btn">Publish</button>
    <p id="publish-result" hidden></p>
  </section>

  <section id="delete-page" hidden>
    <h2>Delete this page</h2>
    <label>Password: <input type="password" id="delete-passwd"></label>
    <button type="button" id="delete-btn">Delete</button>
    <p id="delete-result" hidden></p>
  </section>
</main>

<script type="module" src="/main.js"></script>
</body>
</html>
```

- [ ] **Step 5: vite.config.ts を作成**

```ts
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'src/client',
  publicDir: resolve(__dirname, 'src/client/public'),
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/client/main.ts'),
      formats: ['es'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: 'style.css',
      },
    },
    cssCodeSplit: false,
  },
});
```

- [ ] **Step 6: main.ts の仮スタブを作成し、ビルドが通ることを確認**

`app/src/client/main.ts`（Task 10/11 で内容を実装するまでの最小スタブ）:

```ts
export {};
```

```bash
npm run build
ls dist/client
```

Expected: `dist/client/index.html`, `dist/client/en/index.html`, `dist/client/main.js`, `dist/client/style.css` が生成される。生成されない場合は `vite.config.ts` の `rollupOptions.output.assetFileNames` の挙動を確認し、CSS の出力パスを調整する。

- [ ] **Step 7: コミット**

```bash
git add src/client/diff.worker.ts src/client/public src/client/main.ts vite.config.ts
git commit -m "feat: add client worker, static shell, and build config"
```

---

### Task 10: client/main.ts — フォーム・Worker連携・結果表示・カラー切替

**Files:**
- Modify: `app/src/client/main.ts`

**Interfaces:**
- Consumes: `renderResultTable`/`formatStatsLine`（Task 8）, `DiffResult`/`WorkerResponse`（Task 6/9）

**このタスクにテストはない。** DOM操作とWorker起動を結びつける glue コードであり、Task 17 の E2E テストでカバーする。

- [ ] **Step 1: main.ts を実装（フォーム送信・Worker起動・結果描画・キャンセル・カラー切替・印刷用トグル）**

```ts
import { renderResultTable, formatStatsLine } from './render.js';
import type { DiffResult } from '../core/types.js';
import type { WorkerRequest, WorkerResponse } from './diff.worker.js';

const form = document.querySelector<HTMLFormElement>('#difff-form')!;
const textareaA = document.querySelector<HTMLTextAreaElement>('#sequenceA')!;
const textareaB = document.querySelector<HTMLTextAreaElement>('#sequenceB')!;
const compareBtn = document.querySelector<HTMLButtonElement>('#compare-btn')!;
const cancelBtn = document.querySelector<HTMLButtonElement>('#cancel-btn')!;
const progress = document.querySelector<HTMLElement>('#progress')!;
const resultSection = document.querySelector<HTMLElement>('#result')!;
const resultTable = document.querySelector<HTMLTableElement>('#result-table')!;
const statsA = document.querySelector<HTMLElement>('#stats-a')!;
const statsB = document.querySelector<HTMLElement>('#stats-b')!;
const hideFormBtn = document.querySelector<HTMLButtonElement>('#hide-form-btn')!;

let worker: Worker | null = null;

function startCompare(a: string, b: string): void {
  worker?.terminate();
  worker = new Worker(new URL('./diff.worker.ts', import.meta.url), { type: 'module' });
  compareBtn.disabled = true;
  cancelBtn.hidden = false;
  progress.hidden = false;

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    compareBtn.disabled = false;
    cancelBtn.hidden = true;
    progress.hidden = true;
    if (event.data.ok) {
      const result: DiffResult = event.data.result;
      renderResultTable(resultTable, result);
      statsA.textContent = formatStatsLine(result.statsA);
      statsB.textContent = formatStatsLine(result.statsB);
      resultSection.hidden = false;
    } else {
      window.alert(`比較に失敗しました: ${event.data.error}`);
    }
    worker?.terminate();
    worker = null;
  };

  const request: WorkerRequest = { a, b };
  worker.postMessage(request);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  startCompare(textareaA.value, textareaB.value);
});

cancelBtn.addEventListener('click', () => {
  worker?.terminate();
  worker = null;
  compareBtn.disabled = false;
  cancelBtn.hidden = true;
  progress.hidden = true;
});

hideFormBtn.addEventListener('click', () => {
  const isFormVisible = form.style.display !== 'none';
  form.style.display = isFormVisible ? 'none' : '';
  hideFormBtn.textContent = isFormVisible ? '全体を表示' : '結果のみ表示 (印刷用)';
});

document.querySelectorAll<HTMLInputElement>('input[name="color"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    document.body.dataset.colorScheme = radio.value;
  });
});
```

- [ ] **Step 2: ビルドが通ることを確認**

```bash
npm run build
npm run typecheck
```

Expected: どちらもエラーなく終了する。

- [ ] **Step 3: コミット**

```bash
git add src/client/main.ts
git commit -m "feat: wire up compare form, worker, and result rendering"
```

---

### Task 11: client/main.ts — 公開・削除UIと保存済みページの復元

**Files:**
- Modify: `app/src/client/main.ts`

**Interfaces:**
- Consumes: `/api/save`, `/api/delete`（Task 14/15 で実装される Worker エンドポイント）

- [ ] **Step 1: main.ts に公開・削除・プリロード復元のロジックを追加**

`main.ts` の末尾（Task 10 のコードの後）に追記:

```ts
const publishBtn = document.querySelector<HTMLButtonElement>('#publish-btn')!;
const publishPasswd = document.querySelector<HTMLInputElement>('#publish-passwd')!;
const publishResult = document.querySelector<HTMLElement>('#publish-result')!;
const deleteSection = document.querySelector<HTMLElement>('#delete-page')!;
const deleteBtn = document.querySelector<HTMLButtonElement>('#delete-btn')!;
const deletePasswd = document.querySelector<HTMLInputElement>('#delete-passwd')!;
const deleteResult = document.querySelector<HTMLElement>('#delete-result')!;

let currentPageId: string | null = null;

publishBtn.addEventListener('click', async () => {
  const res = await fetch('/api/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      lang: document.documentElement.lang === 'en' ? 'en' : 'ja',
      a: textareaA.value,
      b: textareaB.value,
      passwd: publishPasswd.value,
    }),
  });
  const json = (await res.json()) as { id?: string; error?: string };
  publishResult.hidden = false;
  if (res.ok && json.id) {
    const url = `${location.origin}/${json.id}`;
    publishResult.textContent = `公開しました: ${url}`;
    currentPageId = json.id;
    deleteSection.hidden = false;
  } else {
    publishResult.textContent = `失敗しました: ${json.error ?? 'unknown error'}`;
  }
});

deleteBtn.addEventListener('click', async () => {
  if (!currentPageId) return;
  const res = await fetch('/api/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: currentPageId, passwd: deletePasswd.value }),
  });
  const json = (await res.json()) as { ok?: boolean; error?: string };
  deleteResult.hidden = false;
  deleteResult.textContent = res.ok ? '削除しました' : `失敗しました: ${json.error ?? 'unknown error'}`;
});

function loadPreload(): void {
  const el = document.querySelector('#difff-preload');
  if (!el || !el.textContent) return;
  const data = JSON.parse(el.textContent) as { id: string; a: string; b: string };
  textareaA.value = data.a;
  textareaB.value = data.b;
  currentPageId = data.id;
  deleteSection.hidden = false;
  startCompare(data.a, data.b);
}

loadPreload();
```

- [ ] **Step 2: ビルドが通ることを確認**

```bash
npm run build
npm run typecheck
```

Expected: どちらもエラーなく終了する。

- [ ] **Step 3: コミット**

```bash
git add src/client/main.ts
git commit -m "feat: add publish/delete UI and preload restoration"
```

---

### Task 12: i18n メッセージカタログ

**Files:**
- Create: `app/src/i18n/messages.ts`
- Create: `app/src/i18n/ja.ts`
- Create: `app/src/i18n/en.ts`
- Test: `app/test/i18n/messages.test.ts`
- Modify: `app/src/client/main.ts`

**Interfaces:**
- Produces: `export interface Messages { ... }`, `export const ja: Messages`, `export const en: Messages`

- [ ] **Step 1: 失敗するテストを書く**

`app/test/i18n/messages.test.ts`:

```ts
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
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npm test -- test/i18n/messages.test.ts
```

Expected: `Cannot find module '../../src/i18n/ja.js'` で FAIL。

- [ ] **Step 3: messages.ts / ja.ts / en.ts を実装**

`app/src/i18n/messages.ts`:

```ts
export interface Messages {
  publishSuccess: (url: string) => string;
  publishFailure: (error: string) => string;
  deleteSuccess: string;
  deleteFailure: (error: string) => string;
  compareFailure: (error: string) => string;
  hideForm: string;
  showAll: string;
}
```

`app/src/i18n/ja.ts`:

```ts
import type { Messages } from './messages.js';

export const ja: Messages = {
  publishSuccess: (url) => `公開しました: ${url}`,
  publishFailure: (error) => `失敗しました: ${error}`,
  deleteSuccess: '削除しました',
  deleteFailure: (error) => `失敗しました: ${error}`,
  compareFailure: (error) => `比較に失敗しました: ${error}`,
  hideForm: '結果のみ表示 (印刷用)',
  showAll: '全体を表示',
};
```

`app/src/i18n/en.ts`:

```ts
import type { Messages } from './messages.js';

export const en: Messages = {
  publishSuccess: (url) => `Published: ${url}`,
  publishFailure: (error) => `Failed: ${error}`,
  deleteSuccess: 'Deleted',
  deleteFailure: (error) => `Failed: ${error}`,
  compareFailure: (error) => `Compare failed: ${error}`,
  hideForm: 'Hide form (print friendly)',
  showAll: 'Show all',
};
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npm test -- test/i18n/messages.test.ts
```

Expected: 全テストが PASS。

- [ ] **Step 5: main.ts をメッセージカタログ経由に書き換える**

`app/src/client/main.ts` の先頭に import を追加し、ハードコードされた日本語文言をカタログ参照に置き換える:

```ts
import { ja } from '../i18n/ja.js';
import { en } from '../i18n/en.js';
import type { Messages } from '../i18n/messages.js';

const messages: Messages = document.documentElement.lang === 'en' ? en : ja;
```

以下の箇所を置き換える:
- `window.alert(\`比較に失敗しました: ${event.data.error}\`)` → `window.alert(messages.compareFailure(event.data.error))`
- `hideFormBtn.textContent = isFormVisible ? '全体を表示' : '結果のみ表示 (印刷用)'` → `hideFormBtn.textContent = isFormVisible ? messages.showAll : messages.hideForm`
- `publishResult.textContent = \`公開しました: ${url}\`` → `publishResult.textContent = messages.publishSuccess(url)`
- `publishResult.textContent = \`失敗しました: ${json.error ?? 'unknown error'}\`` → `publishResult.textContent = messages.publishFailure(json.error ?? 'unknown error')`
- `deleteResult.textContent = res.ok ? '削除しました' : ...` → `deleteResult.textContent = res.ok ? messages.deleteSuccess : messages.deleteFailure(json.error ?? 'unknown error')`

- [ ] **Step 6: ビルドが通ることを確認**

```bash
npm run build
npm run typecheck
```

Expected: どちらもエラーなく終了する。

- [ ] **Step 7: コミット**

```bash
git add src/i18n src/client/main.ts test/i18n/messages.test.ts
git commit -m "feat: wire up ja/en message catalogs"
```

---

### Task 13: Worker ルーティングスケルトン + KV バインディング

**Files:**
- Create: `app/src/worker/index.ts`
- Modify: `app/wrangler.jsonc`

**Interfaces:**
- Produces: `export interface Env { DIFFF_KV: KVNamespace; ASSETS: Fetcher }`

- [ ] **Step 1: KV namespace を作成し、IDを控える**

```bash
cd app
npx wrangler kv namespace create DIFFF_KV
```

出力される `id` の値を次のステップで `wrangler.jsonc` に書き込む。（Cloudflare アカウントに紐づく値のため、実行者ごとに異なる。ローカル開発のみで進める場合はこのステップをスキップし、`npx wrangler dev` の `--local` モード（デフォルト）で自動生成されるローカル KV を使ってよい。）

- [ ] **Step 2: wrangler.jsonc に kv_namespaces を追加**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "difff",
  "main": "src/worker/index.ts",
  "compatibility_date": "2026-08-01",
  "assets": {
    "directory": "./dist/client",
    "binding": "ASSETS"
  },
  "kv_namespaces": [
    { "binding": "DIFFF_KV", "id": "REPLACE_WITH_KV_NAMESPACE_ID" }
  ]
}
```

`REPLACE_WITH_KV_NAMESPACE_ID` を Step 1 で得た実際の ID に置き換える。

- [ ] **Step 3: index.ts を実装**

```ts
/// <reference types="@cloudflare/workers-types" />
import { handleSave } from './save.js';
import { handleDelete } from './delete.js';
import { handlePage } from './page.js';

export interface Env {
  DIFFF_KV: KVNamespace;
  ASSETS: Fetcher;
}

// 公開ID: a-k, m, n, p-z, 2-9 の32文字から成る5文字（0, o, 1, l を除外）
const ID_RE = /^\/([a-km-np-z2-9]{5})(\.html)?$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/api/save') {
      return handleSave(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/delete') {
      return handleDelete(request, env);
    }

    const idMatch = url.pathname.match(ID_RE);
    if (idMatch) {
      if (idMatch[2]) {
        return Response.redirect(`${url.origin}/${idMatch[1]}`, 301);
      }
      return handlePage(idMatch[1], env);
    }

    return env.ASSETS.fetch(request);
  },
};
```

このタスクの時点では `save.ts` / `delete.ts` / `page.ts` はまだ存在しないため、次のステップではビルドは通らない。Task 14〜16 で実装する。

- [ ] **Step 4: コミット**

```bash
git add wrangler.jsonc
git commit -m "chore: add KV namespace binding"
```

（`src/worker/index.ts` は Task 14 の最初のコミットに含める。）

---

### Task 14: worker/save.ts（POST /api/save）

**Files:**
- Create: `app/src/worker/save.ts`
- Create: `app/test/worker/vitest.config.ts`
- Test: `app/test/worker/save.test.ts`

**Interfaces:**
- Consumes: `Env`（Task 13）
- Produces:
  - `export interface SavedPage { v: 1; lang: 'ja' | 'en'; a: string; b: string; salt: string; pwHash: string; createdAt: number }`
  - `export async function hashPassword(password: string, salt: string): Promise<string>`
  - `export async function handleSave(request: Request, env: Env): Promise<Response>`

- [ ] **Step 1: test/worker/vitest.config.ts を作成（Worker テスト専用の Vitest 設定）**

```ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    include: ['test/worker/**/*.test.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
      },
    },
  },
});
```

- [ ] **Step 2: 失敗するテストを書く**

`app/test/worker/save.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { handleSave } from '../../src/worker/save.js';
import type { Env } from '../../src/worker/index.js';

describe('handleSave', () => {
  it('stores a record in KV and returns a 5-char id', async () => {
    const request = new Request('http://internal/api/save', {
      method: 'POST',
      body: JSON.stringify({ lang: 'ja', a: 'hello', b: 'world', passwd: 'secret' }),
    });
    const res = await handleSave(request, env as unknown as Env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { id: string };
    expect(json.id).toMatch(/^[a-km-np-z2-9]{5}$/);

    const stored = await (env as unknown as Env).DIFFF_KV.get(`page:${json.id}`);
    expect(stored).not.toBeNull();
    const record = JSON.parse(stored!);
    expect(record.a).toBe('hello');
    expect(record.b).toBe('world');
  });

  it('rejects input over the combined size limit', async () => {
    const big = 'x'.repeat(150_000);
    const request = new Request('http://internal/api/save', {
      method: 'POST',
      body: JSON.stringify({ lang: 'ja', a: big, b: big, passwd: '' }),
    });
    const res = await handleSave(request, env as unknown as Env);
    expect(res.status).toBe(413);
  });

  it('rejects empty input', async () => {
    const request = new Request('http://internal/api/save', {
      method: 'POST',
      body: JSON.stringify({ lang: 'ja', a: '', b: '', passwd: '' }),
    });
    const res = await handleSave(request, env as unknown as Env);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: テストが失敗することを確認**

```bash
npm run build
npm run test:worker -- test/worker/save.test.ts
```

Expected: `Cannot find module '../../src/worker/save.js'` で FAIL。

- [ ] **Step 4: save.ts を実装**

```ts
/// <reference types="@cloudflare/workers-types" />
import type { Env } from './index.js';

// 0, o, 1, l を除外した32文字（オリジナル difff の save.cgi と同一の文字セット）
const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const ID_LENGTH = 5;
const TTL_SECONDS = 259200; // 3日
const MAX_TOTAL_CHARS = 200_000;
const MAX_ID_RETRIES = 5;

export interface SavedPage {
  v: 1;
  lang: 'ja' | 'en';
  a: string;
  b: string;
  salt: string;
  pwHash: string;
  createdAt: number;
}

function randomId(): string {
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);
  let id = '';
  for (const byte of bytes) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return id;
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(salt + password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function handleSave(request: Request, env: Env): Promise<Response> {
  let body: { lang?: string; a?: string; b?: string; passwd?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const lang: 'ja' | 'en' = body.lang === 'en' ? 'en' : 'ja';
  const a = body.a ?? '';
  const b = body.b ?? '';
  const passwd = body.passwd ?? '';

  if (a.length + b.length > MAX_TOTAL_CHARS) {
    return Response.json({ error: 'input too large' }, { status: 413 });
  }
  if (a === '' && b === '') {
    return Response.json({ error: 'empty input' }, { status: 400 });
  }

  const salt = randomId() + randomId();
  const pwHash = await hashPassword(passwd, salt);

  const record: SavedPage = {
    v: 1,
    lang,
    a,
    b,
    salt,
    pwHash,
    createdAt: Math.floor(Date.now() / 1000),
  };

  for (let attempt = 0; attempt < MAX_ID_RETRIES; attempt++) {
    const id = randomId();
    const key = `page:${id}`;
    const existing = await env.DIFFF_KV.get(key);
    if (existing !== null) continue;
    await env.DIFFF_KV.put(key, JSON.stringify(record), { expirationTtl: TTL_SECONDS });
    return Response.json({ id });
  }

  return Response.json({ error: 'could not allocate id' }, { status: 503 });
}
```

- [ ] **Step 5: テストが通ることを確認**

```bash
npm run test:worker -- test/worker/save.test.ts
```

Expected: 全テストが PASS。

- [ ] **Step 6: コミット**

```bash
git add src/worker/index.ts src/worker/save.ts test/worker/vitest.config.ts test/worker/save.test.ts
git commit -m "feat: add POST /api/save with KV storage"
```

---

### Task 15: worker/delete.ts（POST /api/delete）

**Files:**
- Create: `app/src/worker/delete.ts`
- Test: `app/test/worker/delete.test.ts`

**Interfaces:**
- Consumes: `Env`（Task 13）, `SavedPage`/`hashPassword`（Task 14）
- Produces: `export async function handleDelete(request: Request, env: Env): Promise<Response>`

- [ ] **Step 1: 失敗するテストを書く**

`app/test/worker/delete.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { handleSave } from '../../src/worker/save.js';
import { handleDelete } from '../../src/worker/delete.js';
import type { Env } from '../../src/worker/index.js';

describe('handleDelete', () => {
  it('deletes a record when the password matches', async () => {
    const saveRes = await handleSave(
      new Request('http://internal/api/save', {
        method: 'POST',
        body: JSON.stringify({ lang: 'ja', a: 'x', b: 'y', passwd: 'correct-horse' }),
      }),
      env as unknown as Env
    );
    const { id } = (await saveRes.json()) as { id: string };

    const delRes = await handleDelete(
      new Request('http://internal/api/delete', {
        method: 'POST',
        body: JSON.stringify({ id, passwd: 'correct-horse' }),
      }),
      env as unknown as Env
    );
    expect(delRes.status).toBe(200);
    expect(await (env as unknown as Env).DIFFF_KV.get(`page:${id}`)).toBeNull();
  });

  it('rejects deletion with the wrong password and keeps the record', async () => {
    const saveRes = await handleSave(
      new Request('http://internal/api/save', {
        method: 'POST',
        body: JSON.stringify({ lang: 'ja', a: 'x', b: 'y', passwd: 'right' }),
      }),
      env as unknown as Env
    );
    const { id } = (await saveRes.json()) as { id: string };

    const delRes = await handleDelete(
      new Request('http://internal/api/delete', {
        method: 'POST',
        body: JSON.stringify({ id, passwd: 'wrong' }),
      }),
      env as unknown as Env
    );
    expect(delRes.status).toBe(403);
    expect(await (env as unknown as Env).DIFFF_KV.get(`page:${id}`)).not.toBeNull();
  });

  it('returns 404 for an unknown id', async () => {
    const delRes = await handleDelete(
      new Request('http://internal/api/delete', {
        method: 'POST',
        body: JSON.stringify({ id: 'zzzzz', passwd: 'anything' }),
      }),
      env as unknown as Env
    );
    expect(delRes.status).toBe(404);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npm run test:worker -- test/worker/delete.test.ts
```

Expected: `Cannot find module '../../src/worker/delete.js'` で FAIL。

- [ ] **Step 3: delete.ts を実装**

```ts
/// <reference types="@cloudflare/workers-types" />
import type { Env } from './index.js';
import { hashPassword } from './save.js';
import type { SavedPage } from './save.js';

export async function handleDelete(request: Request, env: Env): Promise<Response> {
  let body: { id?: string; passwd?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const id = body.id ?? '';
  const passwd = body.passwd ?? '';
  const key = `page:${id}`;

  const raw = await env.DIFFF_KV.get(key);
  if (raw === null) {
    return Response.json({ error: 'not found' }, { status: 404 });
  }

  const record = JSON.parse(raw) as SavedPage;
  const hash = await hashPassword(passwd, record.salt);
  if (hash !== record.pwHash) {
    return Response.json({ error: 'wrong password' }, { status: 403 });
  }

  await env.DIFFF_KV.delete(key);
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npm run test:worker -- test/worker/delete.test.ts
```

Expected: 全テストが PASS。

- [ ] **Step 5: コミット**

```bash
git add src/worker/delete.ts test/worker/delete.test.ts
git commit -m "feat: add POST /api/delete"
```

---

### Task 16: worker/page.ts（GET /:id 公開ページ）

**Files:**
- Create: `app/src/worker/page.ts`
- Test: `app/test/worker/page.test.ts`

**Interfaces:**
- Consumes: `Env`（Task 13）, `SavedPage`（Task 14）
- Produces: `export async function handlePage(id: string, env: Env): Promise<Response>`

- [ ] **Step 1: 失敗するテストを書く**

`app/test/worker/page.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { handleSave } from '../../src/worker/save.js';
import { handlePage } from '../../src/worker/page.js';
import type { Env } from '../../src/worker/index.js';

describe('handlePage', () => {
  it('embeds the saved text as a preload script for the client to pick up', async () => {
    const saveRes = await handleSave(
      new Request('http://internal/api/save', {
        method: 'POST',
        body: JSON.stringify({ lang: 'ja', a: 'hello <b>', b: 'world', passwd: '' }),
      }),
      env as unknown as Env
    );
    const { id } = (await saveRes.json()) as { id: string };

    const res = await handlePage(id, env as unknown as Env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="difff-preload"');
    expect(html).toContain('"a":"hello <b>"');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await handlePage('zzzzz', env as unknown as Env);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npm run build
npm run test:worker -- test/worker/page.test.ts
```

Expected: `Cannot find module '../../src/worker/page.js'` で FAIL。

- [ ] **Step 3: page.ts を実装**

```ts
/// <reference types="@cloudflare/workers-types" />
import type { Env } from './index.js';
import type { SavedPage } from './save.js';

function escapeForInlineScript(json: string): string {
  return json.replace(/</g, '\\u003c');
}

export async function handlePage(id: string, env: Env): Promise<Response> {
  const raw = await env.DIFFF_KV.get(`page:${id}`);
  if (raw === null) {
    return new Response('Not found', { status: 404 });
  }
  const record = JSON.parse(raw) as SavedPage;

  const shellPath = record.lang === 'en' ? '/en/index.html' : '/index.html';
  const shellRes = await env.ASSETS.fetch(new URL(shellPath, 'http://internal/'));
  if (!shellRes.ok) {
    return new Response('Shell not found', { status: 500 });
  }
  const shell = await shellRes.text();

  const payload = escapeForInlineScript(JSON.stringify({ id, a: record.a, b: record.b }));
  const injected = shell.replace(
    '</head>',
    `<script id="difff-preload" type="application/json">${payload}</script></head>`
  );

  return new Response(injected, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npm run test:worker -- test/worker/page.test.ts
```

Expected: 全テストが PASS。テストが `dist/client/index.html` を要求するため、事前に `npm run build`（`pretest:worker` により自動実行）が必要。

- [ ] **Step 5: コミット**

```bash
git add src/worker/page.ts test/worker/page.test.ts
git commit -m "feat: add GET /:id published page rendering"
```

---

### Task 17: E2E テスト（Playwright）

**Files:**
- Create: `app/playwright.config.ts`
- Create: `app/test/e2e/compare.spec.ts`
- Create: `app/test/e2e/publish-delete.spec.ts`

**Interfaces:**
- 実ブラウザ経由で `wrangler dev` が起動するローカルサーバに対してテストする。

- [ ] **Step 1: playwright.config.ts を作成**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  webServer: {
    command: 'npm run build && npm run dev',
    url: 'http://localhost:8787',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://localhost:8787',
  },
});
```

- [ ] **Step 2: compare.spec.ts を作成（比較のゴールデンパス）**

```ts
import { test, expect } from '@playwright/test';

test('compares two texts and highlights the difference', async ({ page }) => {
  await page.goto('/');
  await page.fill('#sequenceA', 'the quick brown fox');
  await page.fill('#sequenceB', 'the quick red fox');
  await page.click('#compare-btn');

  const resultSection = page.locator('#result');
  await expect(resultSection).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#result-table em').first()).toBeVisible();
});

test('cancel button stops a running comparison', async ({ page }) => {
  await page.goto('/');
  const big = Array.from({ length: 50_000 }, () => 'x').join('');
  await page.fill('#sequenceA', big);
  await page.fill('#sequenceB', big.split('').reverse().join(''));
  await page.click('#compare-btn');
  await expect(page.locator('#cancel-btn')).toBeVisible();
  await page.click('#cancel-btn');
  await expect(page.locator('#cancel-btn')).toBeHidden();
  await expect(page.locator('#compare-btn')).toBeEnabled();
});
```

- [ ] **Step 3: publish-delete.spec.ts を作成（公開・削除フロー）**

```ts
import { test, expect } from '@playwright/test';

test('publishes a result and can delete it with the correct password', async ({ page }) => {
  await page.goto('/');
  await page.fill('#sequenceA', 'foo');
  await page.fill('#sequenceB', 'bar');
  await page.click('#compare-btn');
  await expect(page.locator('#result')).toBeVisible({ timeout: 10_000 });

  await page.fill('#publish-passwd', 'e2e-test-password');
  await page.click('#publish-btn');

  const publishResult = page.locator('#publish-result');
  await expect(publishResult).toBeVisible();
  const text = await publishResult.textContent();
  expect(text).toMatch(/https?:\/\/.+\/[a-km-np-z2-9]{5}/);

  const url = text!.match(/(https?:\/\/\S+)/)![1];
  await page.goto(url);
  await expect(page.locator('#result')).toBeVisible({ timeout: 10_000 });

  await expect(page.locator('#delete-page')).toBeVisible();
  await page.fill('#delete-passwd', 'e2e-test-password');
  await page.click('#delete-btn');
  await expect(page.locator('#delete-result')).toContainText('削除しました');
});
```

- [ ] **Step 4: Playwright ブラウザをインストールし、テストを実行**

```bash
npx playwright install --with-deps chromium
npm run test:e2e
```

Expected: 全テストが PASS。`wrangler dev` の起動に時間がかかる場合は `playwright.config.ts` の `webServer.timeout` を延長する。

- [ ] **Step 5: コミット**

```bash
git add playwright.config.ts test/e2e
git commit -m "test: add end-to-end coverage for compare and publish/delete flows"
```

---

### Task 18: README とデプロイ手順の最終確認

**Files:**
- Create: `app/README.md`

- [ ] **Step 1: README.md を作成**

```markdown
# difff (Cloudflare Workers 版)

[difff《ﾃﾞｭﾌﾌ》](https://github.com/meso-cacase/difff) の Cloudflare Workers 移植版。
テキスト比較の差分計算はブラウザ（Web Worker）で行い、Cloudflare Worker は
静的アセット配信と結果公開機能（Workers KV）のみを担当する。

設計の詳細は [docs/superpowers/specs/2026-08-14-difff-cloudflare-design.md](docs/superpowers/specs/2026-08-14-difff-cloudflare-design.md) を参照。

## セットアップ

```bash
npm install
npx wrangler kv namespace create DIFFF_KV
# 出力された id を wrangler.jsonc の kv_namespaces[0].id に設定する
```

## 開発

```bash
npm run dev        # wrangler dev でローカル起動
npm test           # core/client/i18n/golden のユニットテスト
npm run test:worker  # KVを含むWorkerテスト
npm run test:e2e   # Playwright E2E（要 wrangler dev 起動）
npm run typecheck
```

## デプロイ

```bash
npm run deploy
```

`wrangler.jsonc` の KV namespace ID が本番用のものに設定されていることを確認してから実行する。

## オリジナルとの既知の差分

移植に伴う意図的な逸脱は設計書の「11. 移植に伴う既知の逸脱一覧」を参照。
```

- [ ] **Step 2: 全テストスイートを通しで実行し、最終確認**

```bash
npm run typecheck
npm test
npm run test:worker
npm run test:e2e
```

Expected: 全て PASS。

- [ ] **Step 3: コミット**

```bash
git add README.md
git commit -m "docs: add README with setup and deploy instructions"
```
