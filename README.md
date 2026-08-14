# difff (Cloudflare Workers 版)

[difff《ﾃﾞｭﾌﾌ》](https://github.com/meso-cacase/difff) の Cloudflare Workers 移植版。
テキスト比較の差分計算はブラウザ（Web Worker）で行い、Cloudflare Worker は
静的アセット配信と結果公開機能（Workers KV）のみを担当する。

設計の詳細は [docs/superpowers/specs/2026-08-14-difff-cloudflare-design.md](docs/superpowers/specs/2026-08-14-difff-cloudflare-design.md) を参照。

## セットアップ

```bash
npm install
npx wrangler kv namespace create DIFFF_KV
# 出力された id を wrangler.jsonc の kv_namespaces[0].id に設定する
```

## 開発

```bash
npm run dev        # wrangler dev でローカル起動
npm test           # core/client/i18n/golden のユニットテスト
npm run test:worker  # KVを含むWorkerテスト
npm run test:e2e   # Playwright E2E（要 wrangler dev 起動）
npm run typecheck
```

## デプロイ

```bash
npm run deploy
```

`wrangler.jsonc` の KV namespace ID が本番用のものに設定されていることを確認してから実行する。

## オリジナルとの既知の差分

移植に伴う意図的な逸脱は設計書の「11. 移植に伴う既知の逸脱一覧」を参照。
