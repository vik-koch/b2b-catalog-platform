import { aboutPageSeed } from '@b2b-catalog-platform/seed';
import { sanitizeRichText } from '@b2b-catalog-platform/shared/node';
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
    // The seed writes through the sanitizer, so that is the stored form.
    bodyHtml: sanitizeRichText(aboutPageSeed.bodyHtml),
    updatedAt: expect.any(String),
  });
});
