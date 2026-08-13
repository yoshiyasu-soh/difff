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
