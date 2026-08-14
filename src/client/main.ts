import { renderResultTable, formatStatsLine } from './render.js';
import type { DiffResult } from '../core/types.js';
import type { WorkerRequest, WorkerResponse } from './diff.worker.js';
import { ja } from '../i18n/ja.js';
import { en } from '../i18n/en.js';
import type { Messages } from '../i18n/messages.js';

const messages: Messages = document.documentElement.lang === 'en' ? en : ja;

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
      window.alert(messages.compareFailure(event.data.error));
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
  hideFormBtn.textContent = isFormVisible ? messages.showAll : messages.hideForm;
});

document.querySelectorAll<HTMLInputElement>('input[name="color"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    document.body.dataset.colorScheme = radio.value;
  });
});

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
    publishResult.textContent = messages.publishSuccess(url);
    currentPageId = json.id;
    deleteSection.hidden = false;
  } else {
    publishResult.textContent = messages.publishFailure(json.error ?? 'unknown error');
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
  deleteResult.textContent = res.ok ? messages.deleteSuccess : messages.deleteFailure(json.error ?? 'unknown error');
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
