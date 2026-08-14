import type { Messages } from './messages.js';

export const en: Messages = {
  publishSuccess: (url) => `Published: ${url}`,
  publishFailure: (error) => `Failed: ${error}`,
  deleteSuccess: 'Deleted',
  deleteFailure: (error) => `Failed: ${error}`,
  compareFailure: (error) => `Compare failed: ${error}`,
  hideForm: 'Hide form (print friendly)',
  showAll: 'Show all',
};
