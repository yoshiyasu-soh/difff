/// <reference types="@cloudflare/workers-types" />
import type { Env } from './index.js';

// 0, o, 1, l を除外した32文字（オリジナル difff の save.cgi と同一の文字セット）
const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const ID_LENGTH = 5;
const TTL_SECONDS = 259200; // 3日
const MAX_TOTAL_CHARS = 200_000;
const MAX_ID_RETRIES = 5;

export interface SavedPage {
  v: 1;
  lang: 'ja' | 'en';
  a: string;
  b: string;
  salt: string;
  pwHash: string;
  createdAt: number;
}

function randomId(): string {
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);
  let id = '';
  for (const byte of bytes) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return id;
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(salt + password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function handleSave(request: Request, env: Env): Promise<Response> {
  let body: { lang?: string; a?: string; b?: string; passwd?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const lang: 'ja' | 'en' = body.lang === 'en' ? 'en' : 'ja';
  const a = body.a ?? '';
  const b = body.b ?? '';
  const passwd = body.passwd ?? '';

  if (a.length + b.length > MAX_TOTAL_CHARS) {
    return Response.json({ error: 'input too large' }, { status: 413 });
  }
  if (a === '' && b === '') {
    return Response.json({ error: 'empty input' }, { status: 400 });
  }

  const salt = randomId() + randomId();
  const pwHash = await hashPassword(passwd, salt);

  const record: SavedPage = {
    v: 1,
    lang,
    a,
    b,
    salt,
    pwHash,
    createdAt: Math.floor(Date.now() / 1000),
  };

  for (let attempt = 0; attempt < MAX_ID_RETRIES; attempt++) {
    const id = randomId();
    const key = `page:${id}`;
    const existing = await env.DIFFF_KV.get(key);
    if (existing !== null) continue;
    await env.DIFFF_KV.put(key, JSON.stringify(record), { expirationTtl: TTL_SECONDS });
    return Response.json({ id });
  }

  return Response.json({ error: 'could not allocate id' }, { status: 503 });
}
