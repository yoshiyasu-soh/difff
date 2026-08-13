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
