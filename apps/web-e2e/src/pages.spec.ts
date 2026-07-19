import { aboutPageSeed } from '@b2b-catalog-platform/seed';
import { expect, test } from '@playwright/test';

test('renders the about page from SSR without a browser refetch', async ({
  page,
}) => {
  const apiCalls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/pages/')) {
      apiCalls.push(request.url());
    }
  });

  // Raw SSR document: rendered content plus the embedded transfer-state
  // payload (HTTP_TRANSFER_CACHE_ORIGIN_MAP) must both be present — the
  // ng-state script is what lets hydration skip the API refetch.
  const ssrResponse = await page.request.get('/about');
  expect(ssrResponse.status()).toBe(200);
  const ssrHtml = await ssrResponse.text();
  expect(ssrHtml).toContain(aboutPageSeed.title);
  expect(ssrHtml).toContain('ng-state');

  await page.goto('/about');
  await expect(page.locator('h1')).toHaveText(aboutPageSeed.title);
  // A phrase from the seeded rich-text body, rendered via innerHTML.
  await expect(page.locator('app-page')).toContainText('Speicherstadt');
  // Hydration replays the response from the transfer cache — no request.
  expect(apiCalls).toEqual([]);
});

test('unknown routes render the 404 page with a real 404 status', async ({
  page,
}) => {
  const response = await page.goto('/definitely-not-a-page');

  expect(response?.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText(/404/);
});
