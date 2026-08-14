import type { Messages } from './messages.js';

export const ja: Messages = {
  publishSuccess: (url) => `公開しました: ${url}`,
  publishFailure: (error) => `失敗しました: ${error}`,
  deleteSuccess: '削除しました',
  deleteFailure: (error) => `失敗しました: ${error}`,
  compareFailure: (error) => `比較に失敗しました: ${error}`,
  hideForm: '結果のみ表示 (印刷用)',
  showAll: '全体を表示',
};
