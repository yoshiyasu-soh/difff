import type { Messages } from './messages.js';

export const en: Messages = {
  publishSuccess: (url) => `Published: ${url}`,
  publishFailure: (error) => `Failed: ${error}`,
  deleteSuccess: 'Deleted',
  deleteFailure: (error) => `Failed: ${error}`,
  compareFailure: (error) => `Compare failed: ${error}`,
  hideForm: 'Hide form (print friendly)',
  showAll: 'Show all',
  stats: (c) => {
    const spaces = c.count2 - c.count1;
    const newlines = c.count3 - c.count2;
    return `Characters: ${c.count1} / Spaces: ${spaces} (incl. spaces: ${c.count2}) / Newlines: ${newlines} (incl. newlines: ${c.count3}) / Words: ${c.wordCount}`;
  },
};
