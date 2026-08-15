import { describe, it, expect } from 'vitest';
import { renderResultTable } from '../../src/client/render.js';
import type { DiffResult } from '../../src/core/types.js';

describe('renderResultTable', () => {
  it('creates one <tr> with a line-number cell before each side per row', () => {
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
    expect(table.rows[0].cells.length).toBe(4);
    expect(table.rows[0].cells[0].textContent).toBe('1');
    expect(table.rows[0].cells[0].className).toBe('line-number');
    expect(table.rows[0].cells[1].textContent).toBe('x');
    expect(table.rows[0].cells[2].textContent).toBe('1');
    expect(table.rows[0].cells[2].className).toBe('line-number');
    expect(table.rows[0].cells[3].textContent).toBe('y');
    expect(table.rows[1].cells[0].textContent).toBe('2');
    expect(table.rows[1].cells[2].textContent).toBe('2');
    expect(table.rows[1].cells[1].querySelector('em')?.textContent).toBe('z');
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
