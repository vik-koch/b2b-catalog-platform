import { aboutPageSeed, conditionsPageSeed } from '@b2b-catalog-platform/seed';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspaceRoot } from './support/localtest';

/** Read from the file the app states the conditions from, so this spec cannot
 * drift from the page it reads. */
const deployment = JSON.parse(
  readFileSync(join(workspaceRoot, 'config/deployment.json'), 'utf8'),
) as {
  delivery: { zones: { title: string }[] };
  pickup: { locations: { name: string; address: string }[] };
};
const appText = JSON.parse(
  readFileSync(join(workspaceRoot, 'config/app-text.json'), 'utf8'),
) as {
  checkout: {
    payment: { cashTitle: string; transferTitle: string };
    fulfilment: { noDelivery: string };
  };
};

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
  await expect(page.locator('app-static-page')).toContainText('Speicherstadt');
  // Hydration replays the response from the transfer cache — no request.
  expect(apiCalls).toEqual([]);
});

// FR-NAV-03: the body is prose; the conditions under it come from config, and
// are in the server's HTML like the body, not painted in afterwards.
test('states the configured conditions under the conditions body', async ({
  page,
}) => {
  const ssrResponse = await page.request.get('/conditions');
  expect(ssrResponse.status()).toBe(200);
  const ssrHtml = await ssrResponse.text();
  for (const zone of deployment.delivery.zones) {
    expect(ssrHtml).toContain(zone.title);
  }

  await page.goto('/conditions');
  await expect(page.locator('h1')).toHaveText(conditionsPageSeed.title);
  const main = page.locator('app-conditions-page');
  for (const point of deployment.pickup.locations) {
    await expect(main).toContainText(point.name);
    await expect(main).toContainText(point.address);
  }
  // The demo's last zone does not deliver, and says so.
  await expect(main).toContainText(appText.checkout.fulfilment.noDelivery);
  await expect(main).toContainText(appText.checkout.payment.cashTitle);
  await expect(main).toContainText(appText.checkout.payment.transferTitle);
});

// Unknown routes and unknown catalog slugs share one 404 screen, and each of
// them must reach a crawler as a real 404 rather than a styled 200.
for (const [what, path] of [
  ['routes', '/definitely-not-a-page'],
  ['products', '/product/definitely-not-a-product'],
  ['categories', '/catalog/definitely-not-a-category'],
] as const) {
  test(`unknown ${what} render the 404 page with a real 404 status`, async ({
    page,
  }) => {
    const response = await page.goto(path);

    expect(response?.status()).toBe(404);
    await expect(page.locator('h1')).toHaveText('Page not found');
    await expect(page.getByRole('link', { name: /^Back to/ })).toBeVisible();
  });
}
