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

  it('rejects a non-string a (array) instead of letting the size cap be bypassed', async () => {
    const request = new Request('http://internal/api/save', {
      method: 'POST',
      body: JSON.stringify({ lang: 'ja', a: ['x'.repeat(300_000)], b: 'y', passwd: '' }),
    });
    const res = await handleSave(request, env as unknown as Env);
    expect(res.status).toBe(400);
    const list = await (env as unknown as Env).DIFFF_KV.list({ prefix: 'page:' });
    expect(list.keys.length).toBe(0);
  });

  it('rejects non-string a/b when they are numbers', async () => {
    const request = new Request('http://internal/api/save', {
      method: 'POST',
      body: JSON.stringify({ lang: 'ja', a: 123, b: 456, passwd: '' }),
    });
    const res = await handleSave(request, env as unknown as Env);
    expect(res.status).toBe(400);
  });
});
