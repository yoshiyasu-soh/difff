/// <reference types="@cloudflare/workers-types" />
import type { Env } from './index.js';
import type { SavedPage } from './save.js';

function escapeForInlineScript(json: string): string {
  return json.replace(/</g, '\\u003c');
}

export async function handlePage(id: string, env: Env): Promise<Response> {
  const raw = await env.DIFFF_KV.get(`page:${id}`);
  if (raw === null) {
    return new Response('Not found', { status: 404 });
  }
  const record = JSON.parse(raw) as SavedPage;

  const shellPath = record.lang === 'en' ? '/en/index.html' : '/index.html';
  const shellRes = await env.ASSETS.fetch(new URL(shellPath, 'http://internal/'));
  if (!shellRes.ok) {
    return new Response('Shell not found', { status: 500 });
  }
  const shell = await shellRes.text();

  const payload = escapeForInlineScript(JSON.stringify({ id, a: record.a, b: record.b }));
  const injected = shell.replace(
    '</head>',
    `<script id="difff-preload" type="application/json">${payload}</script></head>`
  );

  return new Response(injected, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
