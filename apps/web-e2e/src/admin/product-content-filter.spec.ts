import { expect, Locator, Page, test } from '@playwright/test';

import { localtestEnv } from '../support/localtest';

const env = localtestEnv();

/*
 * The product list's content filter (FR-ADM-20): behind a button on a desktop,
 * inside the filter panel on a phone, and in view as chips once asked.
 * Changes nothing but the URL.
 */

async function logIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(env['ADMIN_EMAIL']);
  await page.getByLabel('Password').fill(env['ADMIN_PASSWORD']);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

const pageTop = (locator: Locator) =>
  locator.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);

test('asks a feature as missing, and keeps it in view as a chip', async ({
  page,
  isMobile,
}) => {
  await logIn(page);
  await page.goto('/admin/products');

  if (isMobile) {
    await page.getByRole('button', { name: /Filters/ }).click();
  } else {
    const button = page.getByRole('button', { name: 'Filter by content' });
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
  }

  const documents = page.getByRole('radiogroup', { name: 'Documents' });
  await expect(documents).toBeVisible();
  // Inside the window: the panel is not clipped by the table's scroll box.
  const box = await documents.boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(box && box.x >= 0 && box.x + box.width <= width).toBe(true);

  // On the page, not in the window: the click scrolls it into view.
  const top = await pageTop(documents);
  await documents.getByText('Missing').click();
  await expect(page).toHaveURL(/missing=documents/);
  // Asking holds the panel still, though a chip now shows and the rows change.
  await expect(
    page.getByRole('link', { name: 'Remove the filter Missing Documents' }),
  ).toBeVisible();
  expect(await pageTop(documents)).toBe(top);

  if (!isMobile) {
    await page.keyboard.press('Escape');
    await expect(documents).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Filter by content (1)' }),
    ).toBeFocused();
  }

  const remove = page.getByRole('link', {
    name: 'Remove the filter Missing Documents',
  });
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(page).not.toHaveURL(/missing=/);
});

test('centres the button on the pictures, and the arrow on the button', async ({
  page,
  isMobile,
}) => {
  test.skip(!!isMobile, 'a phone has no heading to hold it');
  await logIn(page);
  await page.goto('/admin/products');

  const button = await page
    .getByRole('button', { name: 'Filter by content' })
    .boundingBox();
  const picture = await page
    .locator('tbody tr')
    .first()
    .locator('td')
    .first()
    .locator('div')
    .first()
    .boundingBox();
  if (!button || !picture) throw new Error('nothing to measure');
  const centre = (b: { x: number; width: number }) => b.x + b.width / 2;
  expect(Math.abs(centre(button) - centre(picture))).toBeLessThanOrEqual(1);

  // The panel's arrow points at the button it hangs from.
  await page.getByRole('button', { name: 'Filter by content' }).click();
  const arrow = await page.locator('ui-popover > span').first().boundingBox();
  if (!arrow) throw new Error('no arrow');
  expect(Math.abs(centre(arrow) - centre(button))).toBeLessThanOrEqual(1);
});
