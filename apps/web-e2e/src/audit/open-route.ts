import type { Page } from '@playwright/test';
import type { AuditRoute } from './routes';

/*
 * The seed dates its records relative to when it ran, so dates move from day
 * to day and times from run to run, and their width moves what stands beside
 * them. Every text node is given one fixed date and time instead, as it is
 * parsed and whenever a render writes it again: numeric, and the long form
 * with the month spelled out (`26. Oktober 2026`, `26 October 2026`).
 */
const FIXED_DATES = `(() => {
  const fix = (node) => {
    const next = node.nodeValue
      .replace(/\\b\\d{2}\\.\\d{2}\\.\\d{4}\\b/g, '01.01.2000')
      .replace(/\\b\\d{1,2}(\\.?) [A-ZÄÖÜ][a-zäöüé]+ \\d{4}\\b/g, '1$1 Januar 2000')
      .replace(/\\b\\d{1,2}:\\d{2}(:\\d{2})?\\b/g, (_, seconds) =>
        seconds ? '00:00:00' : '00:00');
    if (next !== node.nodeValue) node.nodeValue = next;
  };
  const sweep = (root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) fix(node);
  };
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') fix(record.target);
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.TEXT_NODE) fix(node);
        else sweep(node);
      }
    }
  }).observe(document, { subtree: true, childList: true, characterData: true });
})();`;

/**
 * Opens an audited page and brings it to the settled state both the
 * screenshot and the accessibility check look at.
 */
export async function openRoute(page: Page, route: AuditRoute): Promise<void> {
  await page.addInitScript(FIXED_DATES);
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
  // A date field's value is no text node, so the observer above never sees
  // it. Set without an input event, so the form underneath keeps its own.
  await page.evaluate(
    `document.querySelectorAll('input[type=date]').forEach((input) => {
      if (input.value) input.value = '2000-01-01';
    })`,
  );
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
