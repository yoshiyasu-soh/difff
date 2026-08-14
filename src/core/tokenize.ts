export function escapeChar(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;');
}

// [a-z]+ | <$> | 実体参照 | 任意の1文字（コードポイント単位）
const TOKEN_RE = /[a-z]+|<\$>|&#?\w+;|[\s\S]/gu;

export function tokenize(raw: string): string[] {
  const escaped = escapeChar(raw).replace(/\n/g, '<$>');
  return escaped.match(TOKEN_RE) ?? [];
}