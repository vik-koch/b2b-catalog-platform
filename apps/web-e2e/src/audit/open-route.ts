import type { Page } from '@playwright/test';
import type { AuditRoute } from './routes';

/**
 * Opens an audited page and brings it to the settled state both the
 * screenshot and the accessibility check look at.
 */
export async function openRoute(page: Page, route: AuditRoute): Promise<void> {
  await route.before?.(page);
  await page.goto(
    typeof route.path === 'string' ? route.path : await route.path(),
  );
  // The screenshot only waits for two matching frames, which a loading state
  // that holds still for a moment also gives; a quiet network means the page
  // has settled.
  // eslint-disable-next-line playwright/no-networkidle
  await page.waitForLoadState('networkidle');
  await route.arrange?.(page);
  // An arranged state may have scrolled to its message, and a full-page shot
  // taken from there draws the sticky header mid-page.
  await page.evaluate('window.scrollTo(0, 0)');
  // An admin grid sizes its columns from the first render with rows and holds
  // them, whichever of its requests had landed by then. Measuring again now, as
  // a double-click on a boundary does, measures settled content.
  await page.evaluate(
    `document.querySelectorAll('table').forEach((table) => table
      .querySelector('[role=separator][aria-orientation=vertical]')
      ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))`,
  );
}
