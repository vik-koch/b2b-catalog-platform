import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspaceRoot } from '../support/localtest';
import { AUDIT_ROUTES, stateFile } from './routes';

/*
 * One full-page screenshot per audited page, compared with the baseline in
 * tmp/baselines/visual/. A refactor should leave every one of them unchanged;
 * a deliberate visual change shows up here and is accepted by retaking it.
 */

// Whatever is dated today was written by this run's seed, so it moves between
// runs, and so does a time to the second. The seeded orders carry fixed dates
// and stay visible.
const { locale, orderReference } = JSON.parse(
  readFileSync(
    join(workspaceRoot, 'deployments/fixture/config/deployment.json'),
    'utf8',
  ),
);
const today = new Intl.DateTimeFormat(locale, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: orderReference.timezone,
}).format(new Date());

for (const route of AUDIT_ROUTES) {
  test.describe(() => {
    if (route.as) test.use({ storageState: stateFile(route.as) });
    const hidden = route.hide
      ? `${route.hide} { visibility: hidden !important; }`
      : '/* nothing hidden */';
    const { path } = route;
    const resolve = typeof path === 'string' ? async () => path : path;

    test(route.name, async ({ page }) => {
      await route.before?.(page);
      await page.goto(await resolve());
      // The screenshot only waits for two matching frames, which a loading
      // state that holds still for a moment also gives; a quiet network means
      // the page has settled.
      // eslint-disable-next-line playwright/no-networkidle
      await page.waitForLoadState('networkidle');
      await route.arrange?.(page);
      // An arranged state may have scrolled to its message, and a full-page
      // shot taken from there draws the sticky header mid-page.
      await page.evaluate('window.scrollTo(0, 0)');
      // An admin grid sizes its columns from the first render with rows and
      // holds them, whichever of its requests had landed by then. Measuring
      // again now, as a double-click on a boundary does, measures settled
      // content.
      await page.evaluate(
        `document.querySelectorAll('table').forEach((table) => table
          .querySelector('[role=separator][aria-orientation=vertical]')
          ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))`,
      );
      await page.addStyleTag({ content: hidden });
      await page.evaluate('document.fonts.ready');
      await expect(page).toHaveScreenshot(`${route.name}.png`, {
        fullPage: true,
        mask: [
          page.getByText(today),
          page.getByText(/\b\d{1,2}:\d{2}:\d{2}\b/),
          ...(route.mask?.(page) ?? []),
        ],
      });
    });
  });
}
