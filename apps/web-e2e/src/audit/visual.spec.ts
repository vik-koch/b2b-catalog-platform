import { expect, test } from '@playwright/test';
import { openRoute } from './open-route';
import { AUDIT_ROUTES, stateFile } from './routes';

/*
 * One full-page screenshot per audited page, compared with the baseline in
 * tmp/baselines/visual/. A refactor should leave every one of them unchanged;
 * a deliberate visual change shows up here and is accepted by retaking it.
 */
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
        { fullPage: true, mask: route.mask?.(page) ?? [] },
      );
    });
  });
}
