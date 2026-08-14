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
          if (emOpenA) {
            closeEmA();
          } else {
            // 変更ブロック内の完全な空行。マークしないと共通の空行と区別が
            // つかなくなり、差分が消えて見える(final-review I-1)。
            curA = '<em></em>';
          }
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
          if (emOpenB) {
            closeEmB();
          } else {
            curB = '<em></em>';
          }
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

  // 両テキストが改行で終わる場合、実データに存在しない「改行の後の1行」が
  // 余分に1行だけ出力される。差分としてマークされた行(<em></em>)は
  // この条件に一致しないため、実際の空行差分(final-review I-1)は保持される。
  // 入力が空文字列（トークン列が空）の場合も、末尾に「未確定の1行」は
  // 実データとして存在しないため、改行終端と同様にphantom行として扱う。
  const aEndsWithNewline = tokensA.length === 0 || tokensA[tokensA.length - 1] === NEWLINE;
  const bEndsWithNewline = tokensB.length === 0 || tokensB[tokensB.length - 1] === NEWLINE;
  if (
    aEndsWithNewline &&
    bEndsWithNewline &&
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
