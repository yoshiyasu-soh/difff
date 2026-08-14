import { test, expect } from '@playwright/test';

test('compares two texts and highlights the difference', async ({ page }) => {
  await page.goto('/');
  await page.fill('#sequenceA', 'the quick brown fox');
  await page.fill('#sequenceB', 'the quick red fox');
  await page.click('#compare-btn');

  const resultSection = page.locator('#result');
  await expect(resultSection).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#result-table em').first()).toBeVisible();
});

test('cancel button stops a running comparison', async ({ page }) => {
  await page.goto('/');
  // tokenize() merges runs of [a-z]+ into a single token, so a giant string of
  // one repeated letter (and its reverse, which is identical) diffs instantly.
  // Use disjoint digit ranges instead: every character tokenizes on its own and
  // none of them can match between A and B, which hits Myers' O(N*M) worst case
  // and keeps the comparison running long enough to click cancel.
  const n = 15_000;
  const sequenceA = Array.from({ length: n }, (_, i) => String(1 + (i % 5))).join('');
  const sequenceB = Array.from({ length: n }, (_, i) => String(6 + (i % 4))).join('');
  await page.fill('#sequenceA', sequenceA);
  await page.fill('#sequenceB', sequenceB);
  await page.click('#compare-btn');
  await expect(page.locator('#cancel-btn')).toBeVisible();
  await page.click('#cancel-btn');
  await expect(page.locator('#cancel-btn')).toBeHidden();
  await expect(page.locator('#compare-btn')).toBeEnabled();
});
