import { expect, Page, test } from '@playwright/test';
import { localtestEnv } from './support/localtest';

const env = localtestEnv();

/**
 * The attribute inventory (FR-ATTR-09) in a real browser — the parts of it that
 * are layout facts and so cannot be asserted in jsdom, which has no layout.
 */

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
  // The whole point of shaping it after a value row: the list must not resize
  // when the values land. A value row is two lines — what it is, then what can
  // be done to it — and the second is a row of touch-sized glyphs, so a block
  // of bars standing in for the first one alone falls short by half a row and
  // everything below shifts.
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
