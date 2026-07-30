import { expect, Page, test } from '@playwright/test';
import { aboutPageSeed } from '@b2b-catalog-platform/seed';
import { localtestEnv } from './support/localtest';

const env = localtestEnv();
const ADMIN_EMAIL = env['ADMIN_EMAIL'];
const ADMIN_PASSWORD = env['ADMIN_PASSWORD'];

/*
 * Deliberately never saves. The whole suite runs in parallel against one
 * database, and every page title is asserted by navigation.spec.ts — a
 * persisted edit here would race those specs. Saving (including that the
 * public page reflects it) is covered in api-e2e, where the spec owns the
 * database and restores it; what is left for the UI is everything below.
 */

async function logIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

const editButton = (page: Page) =>
  page.getByRole('button', { name: 'Edit page' });

// The pencil affordance only appears once an admin turns on storefront edit
// mode (FR-ADM-01) — a browser-local toggle, so each test enables it afresh.
const enableEditMode = (page: Page) =>
  page.getByRole('button', { name: 'Edit mode' }).click();

test('a signed-out visitor sees no edit affordance', async ({ page }) => {
  await page.goto('/about');

  await expect(page.locator('h1')).toHaveText(aboutPageSeed.title);
  await expect(editButton(page)).toBeHidden();
});

test.describe('as an admin', () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
    await page.goto('/about');
    await enableEditMode(page);
  });

  test('opens the editor loaded with the current content', async ({ page }) => {
    await editButton(page).click();

    await expect(page.getByLabel('Page title')).toHaveValue(
      aboutPageSeed.title,
    );
    await expect(page.locator('.ProseMirror')).toContainText('What we do');
  });

  test('applies formatting through the toolbar', async ({ page }) => {
    await editButton(page).click();

    const body = page.locator('.ProseMirror');
    await body.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('Bold statement');
    await page.keyboard.press('ControlOrMeta+A');
    await page.getByRole('button', { name: 'Bold' }).click();

    await expect(body.locator('strong')).toHaveText('Bold statement');
  });

  test('adds a link through the in-app panel', async ({ page }) => {
    await editButton(page).click();
    const body = page.locator('.ProseMirror');
    // Select the first line only, so exactly one link is created.
    await body.locator('p, h2, h3, li').first().click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');

    await page.getByRole('button', { name: 'Add link' }).click();
    const panel = page.getByRole('dialog', { name: 'Link' });
    // A bare domain is normalized to an https URL the sanitizer accepts.
    await panel.getByLabel('Link address').fill('example.com');
    await panel.getByRole('button', { name: 'Apply' }).click();

    await expect(body.locator('a[href="https://example.com"]')).toHaveCount(1);
  });

  test('uploads an image, shows it, and opens its placement panel', async ({
    page,
  }) => {
    await editButton(page).click();
    const body = page.locator('.ProseMirror');
    await body.click();

    // A tiny PNG is enough — the server re-encodes to WebP regardless.
    await page.locator('input[type="file"]').setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
    });

    const img = body.locator('img');
    // The upload returned a content-hashed /media URL...
    await expect(img).toHaveAttribute('src', /^\/media\/[0-9a-f]{12}\.webp$/);
    // ...and it actually loads through the /media route (proxy -> media nginx).
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);

    // The inserted image is selected, so its panel is open for alt/placement.
    const panel = page.getByRole('dialog', { name: 'Image' });
    await expect(panel.getByLabel('Alt text')).toBeVisible();
  });

  test('previews the edited page as it will look, then returns to editing', async ({
    page,
  }) => {
    await editButton(page).click();
    await page.getByLabel('Page title').fill('Preview heading');

    await page.getByRole('button', { name: 'Preview' }).click();

    await expect(page.locator('h1')).toHaveText('Preview heading');
    await expect(page.getByLabel('Page title')).toBeHidden();
    await expect(page.locator('.ProseMirror')).toBeHidden();

    await page.getByRole('button', { name: 'Back to editing' }).click();

    await expect(page.getByLabel('Page title')).toHaveValue('Preview heading');
  });

  test('discards an edit on cancel, leaving the page as it was', async ({
    page,
  }) => {
    await editButton(page).click();
    await page.getByLabel('Page title').fill('Never saved');

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.locator('h1')).toHaveText(aboutPageSeed.title);

    // Nothing was persisted: a reload still shows the seeded page.
    await page.reload();
    await expect(page.locator('h1')).toHaveText(aboutPageSeed.title);
  });

  const legalPrivacyLink = (page: Page) =>
    page.getByRole('navigation', { name: 'Legal' }).getByRole('link', {
      name: 'Privacy',
    });

  test('keeps the editor open when a page switch is declined', async ({
    page,
  }) => {
    await editButton(page).click();
    await page.getByLabel('Page title').fill('Unsaved edit');

    page.once('dialog', (dialog) => dialog.dismiss());
    await legalPrivacyLink(page).click();

    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByLabel('Page title')).toHaveValue('Unsaved edit');
  });

  test('abandons the edit and lands in read mode when the switch is confirmed', async ({
    page,
  }) => {
    await editButton(page).click();
    await page.getByLabel('Page title').fill('Unsaved edit');

    page.once('dialog', (dialog) => dialog.accept());
    await legalPrivacyLink(page).click();

    await expect(page).toHaveURL(/\/privacy$/);
    // A fresh page, in read mode — the abandoned edit did not carry over.
    await expect(page.getByLabel('Page title')).toBeHidden();
    await expect(editButton(page)).toBeVisible();
  });
});

// A tiny 2x2 RGBA PNG produced by sharp — small, but a real encode the server's
// libvips fully decodes. (A hand-crafted 1x1 PNG passes the header sniff but
// trips "libpng read error" on the full pixel decode in the runtime's libvips.)
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWPI9zP/D8IMMAYAQwwHzSg0SO0AAAAASUVORK5CYII=';
