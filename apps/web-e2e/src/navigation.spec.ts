import {
  aboutPageSeed,
  conditionsPageSeed,
  imprintPageSeed,
  privacyPageSeed,
} from '@b2b-catalog-platform/seed';
import { expect, test } from '@playwright/test';

// Exactly one utility nav is visible at a time: the header's top bar (sm+) or
// the bottom bar's "More" panel once opened.
const visibleUtilityNav = 'nav[aria-label="Utility"]:visible';

/* The suite runs these specs in a mobile project and a desktop one, so the
   viewport branches below are the subject rather than an accident: the nav is
   a different control on each, and asserting it is closed after a tap only
   means anything where a panel opens. */
/* eslint-disable playwright/no-conditional-in-test, playwright/no-conditional-expect */

test('navigates from home to the about page via the utility nav', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');

  if (isMobile) {
    const toggle = page.getByRole('button', { name: 'More' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }

  await page
    .locator(visibleUtilityNav)
    .getByRole('link', { name: 'About us' })
    .click();

  await expect(page).toHaveURL(/\/about$/);
  await expect(page.locator('h1')).toHaveText(aboutPageSeed.title);

  if (isMobile) {
    // The panel closes after navigating.
    await expect(page.locator(visibleUtilityNav)).toHaveCount(0);
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

  await page.goto('/conditions');
  await expect(page.locator('h1')).toHaveText(conditionsPageSeed.title);

  // Marker that a full document reload would wipe — lets us assert the hops
  // below stay within the SPA instead of round-tripping to the server.
  await page.evaluate(() => {
    document.documentElement.dataset['spa'] = 'true';
  });

  await legal.getByRole('link', { name: 'Imprint' }).click();
  await expect(page).toHaveURL(/\/imprint$/);
  await expect(page.locator('h1')).toHaveText(imprintPageSeed.title);

  // A second hop re-exercises the reused component's resource reload.
  await legal.getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.locator('h1')).toHaveText(privacyPageSeed.title);

  await expect(page.locator('html')).toHaveAttribute('data-spa', 'true');
});

// The utility bar collapses out of view once scrolled off the top and comes
// back at the top again. It does that by sliding the header, not by resizing
// it, so its space is always reserved and the page content never jumps.
test('collapsing and restoring the utility bar never moves the page content', async ({
  page,
  isMobile,
}) => {
  // Structural, not a disabled test: the mobile project has no utility bar to
  // collapse, so there is nothing here to assert on a phone viewport.
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(isMobile, 'the utility bar is desktop-only');

  await page.goto('/catalog');
  const heading = page.locator('h1');
  // Position in *document* coordinates, so scrolling alone cannot change it.
  const headingTop = () =>
    heading.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  // Tailwind v4's translate utilities set the `translate` property, not
  // `transform` — which stays "none" throughout.
  const headerOffset = () =>
    page.locator('header').evaluate((el) => getComputedStyle(el).translate);

  const atRest = await headingTop();

  await page.evaluate(() => window.scrollTo(0, 400));
  // Guards the test itself: below the collapse threshold it would prove nothing.
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(96);
  // The header slid up by exactly the utility bar's height.
  await expect.poll(headerOffset).toBe('0px -40px');
  expect(await headingTop()).toBe(atRest);

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(headerOffset).toBe('none');
  expect(await headingTop()).toBe(atRest);
});

// The attribution page and the file behind it only exist in a production
// build: `extractLicenses` writes 3rdpartylicenses.txt beside the server
// bundle, and the SSR tier serves it. Nothing below the container boundary
// proves that — the unit tests stub the fetch — so the smoke test is where the
// wiring is actually checked.
test('serves the third-party license notice behind the footer link', async ({
  page,
  request,
}) => {
  const notice = await request.get('/licenses.txt');
  expect(notice.status()).toBe(200);
  expect(await notice.text()).toContain('Package: ');

  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Legal' })
    .getByRole('link', { name: 'Licenses' })
    .click();

  await expect(page).toHaveURL(/\/licenses$/);
  await expect(page.locator('h1')).toHaveText('Licenses');
  // The list is fetched on hydration, so any entry proves the round trip.
  await expect(page.getByText('@angular/core', { exact: true })).toBeVisible();
});
