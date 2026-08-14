/// <reference types="@cloudflare/workers-types" />
import type { Env } from './index.js';
import { hashPassword } from './save.js';
import type { SavedPage } from './save.js';

export async function handleDelete(request: Request, env: Env): Promise<Response> {
  let body: { id?: string; passwd?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const id = body.id ?? '';
  const passwd = body.passwd ?? '';

  if (typeof id !== 'string' || typeof passwd !== 'string') {
    return Response.json({ error: 'invalid body' }, { status: 400 });
  }

  const key = `page:${id}`;

  const raw = await env.DIFFF_KV.get(key);
  if (raw === null) {
    return Response.json({ error: 'not found' }, { status: 404 });
  }

  const record = JSON.parse(raw) as SavedPage;
  const hash = await hashPassword(passwd, record.salt);
  if (hash !== record.pwHash) {
    return Response.json({ error: 'wrong password' }, { status: 403 });
  }

  await env.DIFFF_KV.delete(key);
  return Response.json({ ok: true });
}
