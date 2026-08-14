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
