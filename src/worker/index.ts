/// <reference types="@cloudflare/workers-types" />
import { handleSave } from './save.js';
import { handleDelete } from './delete.js';

export interface Env {
  DIFFF_KV: KVNamespace;
  ASSETS: Fetcher;
}

// 公開ID: a-k, m, n, p-z, 2-9 の32文字から成る5文字（0, o, 1, l を除外）
const ID_RE = /^\/([a-km-np-z2-9]{5})(\.html)?$/;

// TODO(Task 16): src/worker/page.ts が実装され次第、この inline スタブを
// `import { handlePage } from './page.js';` に置き換える。
async function handlePage(id: string, env: Env): Promise<Response> {
  return new Response('Not Implemented', { status: 501 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/api/save') {
      return handleSave(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/delete') {
      return handleDelete(request, env);
    }

    const idMatch = url.pathname.match(ID_RE);
    if (idMatch) {
      if (idMatch[2]) {
        return Response.redirect(`${url.origin}/${idMatch[1]}`, 301);
      }
      return handlePage(idMatch[1], env);
    }

    return env.ASSETS.fetch(request);
  },
};
