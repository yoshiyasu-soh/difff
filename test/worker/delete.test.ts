import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { handleSave } from '../../src/worker/save.js';
import { handleDelete } from '../../src/worker/delete.js';
import type { Env } from '../../src/worker/index.js';

describe('handleDelete', () => {
  it('deletes a record when the password matches', async () => {
    const saveRes = await handleSave(
      new Request('http://internal/api/save', {
        method: 'POST',
        body: JSON.stringify({ lang: 'ja', a: 'x', b: 'y', passwd: 'correct-horse' }),
      }),
      env as unknown as Env
    );
    const { id } = (await saveRes.json()) as { id: string };

    const delRes = await handleDelete(
      new Request('http://internal/api/delete', {
        method: 'POST',
        body: JSON.stringify({ id, passwd: 'correct-horse' }),
      }),
      env as unknown as Env
    );
    expect(delRes.status).toBe(200);
    expect(await (env as unknown as Env).DIFFF_KV.get(`page:${id}`)).toBeNull();
  });

  it('rejects deletion with the wrong password and keeps the record', async () => {
    const saveRes = await handleSave(
      new Request('http://internal/api/save', {
        method: 'POST',
        body: JSON.stringify({ lang: 'ja', a: 'x', b: 'y', passwd: 'right' }),
      }),
      env as unknown as Env
    );
    const { id } = (await saveRes.json()) as { id: string };

    const delRes = await handleDelete(
      new Request('http://internal/api/delete', {
        method: 'POST',
        body: JSON.stringify({ id, passwd: 'wrong' }),
      }),
      env as unknown as Env
    );
    expect(delRes.status).toBe(403);
    expect(await (env as unknown as Env).DIFFF_KV.get(`page:${id}`)).not.toBeNull();
  });

  it('returns 404 for an unknown id', async () => {
    const delRes = await handleDelete(
      new Request('http://internal/api/delete', {
        method: 'POST',
        body: JSON.stringify({ id: 'zzzzz', passwd: 'anything' }),
      }),
      env as unknown as Env
    );
    expect(delRes.status).toBe(404);
  });

  it('rejects a non-string id', async () => {
    const delRes = await handleDelete(
      new Request('http://internal/api/delete', {
        method: 'POST',
        body: JSON.stringify({ id: ['zzzzz'], passwd: 'anything' }),
      }),
      env as unknown as Env
    );
    expect(delRes.status).toBe(400);
  });

  it('rejects a non-string passwd', async () => {
    const delRes = await handleDelete(
      new Request('http://internal/api/delete', {
        method: 'POST',
        body: JSON.stringify({ id: 'zzzzz', passwd: { x: 1 } }),
      }),
      env as unknown as Env
    );
    expect(delRes.status).toBe(400);
  });
});
