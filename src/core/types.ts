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
