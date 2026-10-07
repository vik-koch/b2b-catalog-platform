import { expect, test } from '@playwright/test';

// A first visit: nothing answered yet (NFR-LEGAL-03).
test.use({ storageState: { cookies: [], origins: [] } });

test('asks before loading the map, and loads it from its own button', async ({
  page,
}) => {
  await page.goto('/contact');

  const banner = page.getByRole('complementary', { name: /cookie/i });
  await expect(banner).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);

  await page.getByRole('button', { name: 'Show the map' }).first().click();

  await expect(page.locator('iframe').first()).toBeVisible();
  // The same consent the banner asks for, so the banner has nothing left to ask.
  await expect(banner).toBeHidden();
});

test('keeps the map hidden once the banner is answered no', async ({
  page,
}) => {
  await page.goto('/contact');
  await page.getByRole('button', { name: 'Reject' }).click();

  await expect(
    page.getByRole('button', { name: 'Show the map' }).first(),
  ).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
});
