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
