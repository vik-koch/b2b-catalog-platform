import {
  aboutPageSeed,
  conditionsPageSeed,
  imprintPageSeed,
  privacyPageSeed,
} from '@b2b-catalog-platform/seed';
import { expect, test } from '@playwright/test';

// Exactly one main nav is visible at a time: the desktop bar (md+) or the
// hamburger panel once opened.
const visibleMainNav = 'nav[aria-label="Main"]:visible';

test('navigates from home to the about page via the main nav', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');

  if (isMobile) {
    const toggle = page.getByRole('button', { name: 'Toggle menu' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }

  await page
    .locator(visibleMainNav)
    .getByRole('link', { name: 'About us' })
    .click();

  await expect(page).toHaveURL(/\/about$/);
  await expect(page.locator('h1')).toHaveText(aboutPageSeed.title);

  if (isMobile) {
    // The panel closes after navigating.
    await expect(page.locator(visibleMainNav)).toHaveCount(0);
  }
});

test('reaches the legal pages from the footer', async ({ page }) => {
  await page.goto('/');

  await page
    .getByRole('navigation', { name: 'Legal' })
    .getByRole('link', { name: 'Privacy' })
    .click();

  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.locator('h1')).toHaveText(privacyPageSeed.title);
});

// Client-side navigation between two DB-backed :slug pages reuses the same
// Page component with a changing slug input, so its resource must reload and
// re-render rather than surface the "Cannot load page" error state. Direct
// SSR loads (pages.spec.ts) don't exercise that in-app hop.
test('navigates between legal pages client-side without a full reload', async ({
  page,
}) => {
  const legal = page.getByRole('navigation', { name: 'Legal' });

  await page.goto('/privacy');
  await expect(page.locator('h1')).toHaveText(privacyPageSeed.title);

  // Marker that a full document reload would wipe — lets us assert the hops
  // below stay within the SPA instead of round-tripping to the server.
  await page.evaluate(() => {
    document.documentElement.dataset['spa'] = 'true';
  });

  await legal.getByRole('link', { name: 'Imprint' }).click();
  await expect(page).toHaveURL(/\/imprint$/);
  await expect(page.locator('h1')).toHaveText(imprintPageSeed.title);

  // A second hop re-exercises the reused component's resource reload.
  await legal.getByRole('link', { name: 'Payment & delivery' }).click();
  await expect(page).toHaveURL(/\/conditions$/);
  await expect(page.locator('h1')).toHaveText(conditionsPageSeed.title);

  await expect(page.locator('html')).toHaveAttribute('data-spa', 'true');
});
