import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspaceRoot } from '../support/localtest';
import { openRoute } from './open-route';
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

    test(route.name, async ({ page }, { project }) => {
      await openRoute(page, route);
      await page.addStyleTag({ content: hidden });
      await page.evaluate('document.fonts.ready');
      await expect(page).toHaveScreenshot(
        ['visual', project.name, `${route.name}.png`],
        {
          fullPage: true,
          mask: [
            page.getByText(today),
            page.getByText(/\b\d{1,2}:\d{2}:\d{2}\b/),
            ...(route.mask?.(page) ?? []),
          ],
        },
      );
    });
  });
}
