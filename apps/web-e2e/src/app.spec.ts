import { test, expect } from '@playwright/test';

test('renders the hello world message from the database', async ({ page }) => {
  // The hydrated app refetches /api/helloworld from the browser (the SSR
  // transfer cache can't serve it — server and client use different URLs).
  // Wait for that refetch before asserting: the SSR HTML already contains
  // the message, so asserting immediately would mask a broken browser-side
  // fetch (the resource replaces the text with an error on failure).
  const clientRefetch = page.waitForResponse('**/api/helloworld');
  await page.goto('/');
  await clientRefetch;

  await expect(page.locator('p')).toHaveText('Hello API');
});

test('serves the API on the same origin under /api', async ({ request }) => {
  const response = await request.get('/api/helloworld');

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ message: 'Hello API' });
});
