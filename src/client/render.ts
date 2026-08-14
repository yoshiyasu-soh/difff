import type { CharCount, DiffResult } from '../core/types.js';

// row.a / row.b は src/core/tokenize.ts の escapeChar() を経たトークンから
// src/core/align.ts の buildRowPairs() が組み立てた HTML 断片。
// ユーザー入力由来の & < > ' " は必ずエスケープ済みで、後から追加される
// 生マークアップはコード側が生成する <em>/</em>/&nbsp; のみ。
// この不変条件が崩れない限り innerHTML への代入は安全（オリジナル difff.pl も同じ設計）。
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
