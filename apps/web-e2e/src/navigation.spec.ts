import { aboutPageSeed } from '@b2b-catalog-platform/seed';
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
