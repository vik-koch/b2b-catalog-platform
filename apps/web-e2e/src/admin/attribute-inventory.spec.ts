import { expect, Page, test } from '@playwright/test';
import { localtestEnv } from '../support/localtest';

const env = localtestEnv();

/** The attribute inventory (FR-ATTR-09) in a browser, for its layout facts,
 * which jsdom cannot assert. */

async function logIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(env['ADMIN_EMAIL']);
  await page.getByLabel('Password').fill(env['ADMIN_PASSWORD']);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test('the values placeholder is the exact size of the rows it stands in for', async ({
  page,
}) => {
  // Shaped like a value row so nothing resizes when values land: two lines,
  // the second touch-sized glyphs, so one bar alone would fall half a row
  // short.
  await logIn(page);

  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/attributes/inventory/values*', async (route) => {
    await held;
    await route.continue();
  });

  await page.goto('/admin/attributes/inventory');
  const row = page.locator('li[id^="attribute-"]').first();
  await expect(row).toBeVisible();
  await row.getByRole('button').first().click();

  const placeholder = page.locator('ul[aria-hidden="true"] > li').first();
  await expect(placeholder).toBeVisible();
  const standIn = await placeholder.boundingBox();

  release?.();
  await expect(page.locator('ul[aria-hidden="true"]')).toHaveCount(0);
  const value = page.locator('li[id^="attribute-"] ul > li').first();
  await expect(value).toBeVisible();
  const real = await value.boundingBox();

  expect(Math.round(standIn?.height ?? -1)).toBe(
    Math.round(real?.height ?? -2),
  );
});

test('a key handed in the URL arrives open and in view', async ({ page }) => {
  // How screens naming an attribute get here (its value count, the grid's
  // key). The row must open and scroll into view: alphabetical, it is often
  // far below the fold.
  await logIn(page);

  await page.goto('/admin/attributes/inventory');
  const anchors = page.locator('li[id^="attribute-"]');
  await expect(anchors.first()).toBeVisible();
  const id = await anchors.last().getAttribute('id');
  const key = (id as string).slice('attribute-'.length).replace(/_/g, ' ');

  await page.goto(`/admin/attributes/inventory?key=${encodeURIComponent(key)}`);

  // By name: two controls open the panel, the key's chevron and the value
  // count.
  const row = page.locator(`li[id="${id}"]`);
  await expect(
    row.getByRole('button', { name: key, expanded: true }),
  ).toBeVisible();
  // In view, not merely rendered: the anchor's point.
  await expect(row).toBeInViewport();
});
