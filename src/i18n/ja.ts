import type { Messages } from './messages.js';

export const ja: Messages = {
  publishSuccess: (url) => `公開しました: ${url}`,
  publishFailure: (error) => `失敗しました: ${error}`,
  deleteSuccess: '削除しました',
  deleteFailure: (error) => `失敗しました: ${error}`,
  compareFailure: (error) => `比較に失敗しました: ${error}`,
  hideForm: '結果のみ表示 (印刷用)',
  showAll: '全体を表示',
  stats: (c) => {
    const spaces = c.count2 - c.count1;
    const newlines = c.count3 - c.count2;
    return `文字数: ${c.count1} / 空白数: ${spaces} (空白込み: ${c.count2}) / 改行数: ${newlines} (改行込み: ${c.count3}) / 単語数: ${c.wordCount}`;
  },
};
