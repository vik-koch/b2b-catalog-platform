import { aboutPageSeed } from '@b2b-catalog-platform/seed';
import { expect, test } from '@playwright/test';

test('renders the home placeholder', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('h1')).toHaveText('Wholesale specialty coffee');
});

test('serves the API on the same origin under /api', async ({ request }) => {
  const response = await request.get('/api/pages/about');

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    title: aboutPageSeed.title,
    bodyHtml: aboutPageSeed.bodyHtml,
  });
});
