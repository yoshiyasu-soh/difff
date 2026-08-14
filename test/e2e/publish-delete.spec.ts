import { test, expect } from '@playwright/test';

test('publishes a result and can delete it with the correct password', async ({ page }) => {
  await page.goto('/');
  await page.fill('#sequenceA', 'foo');
  await page.fill('#sequenceB', 'bar');
  await page.click('#compare-btn');
  await expect(page.locator('#result')).toBeVisible({ timeout: 10_000 });

  await page.fill('#publish-passwd', 'e2e-test-password');
  await page.click('#publish-btn');

  const publishResult = page.locator('#publish-result');
  await expect(publishResult).toBeVisible();
  const text = await publishResult.textContent();
  expect(text).toMatch(/https?:\/\/.+\/[a-km-np-z2-9]{5}/);

  const url = text!.match(/(https?:\/\/\S+)/)![1];
  await page.goto(url);
  await expect(page.locator('#result')).toBeVisible({ timeout: 10_000 });

  await expect(page.locator('#delete-page')).toBeVisible();
  await page.fill('#delete-passwd', 'e2e-test-password');
  await page.click('#delete-btn');
  await expect(page.locator('#delete-result')).toContainText('削除しました');
});
