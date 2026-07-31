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

// Editing lives on its own admin route now, so the storefront affordance is a
// link into it rather than an inline toggle.
const editLink = (page: Page) => page.getByRole('link', { name: 'Edit page' });

// The pencil affordance only appears once an admin turns on storefront edit
// mode (FR-ADM-01) — a browser-local toggle, so each test enables it afresh.
const enableEditMode = (page: Page) =>
  page.getByRole('button', { name: 'Edit mode' }).click();

// Discarding unsaved changes goes through the app's own modal, not
// window.confirm — so it is an in-page dialog, never a Playwright dialog event.
const discardPrompt = (page: Page) =>
  page.getByRole('dialog', { name: 'Discard changes?' });

const discardChanges = (page: Page) =>
  discardPrompt(page).getByRole('button', { name: 'Discard changes' }).click();

const keepEditing = (page: Page) =>
  discardPrompt(page).getByRole('button', { name: 'Keep editing' }).click();

test('a signed-out visitor sees no edit affordance', async ({ page }) => {
  await page.goto('/about');

  await expect(page.locator('h1')).toHaveText(aboutPageSeed.title);
  await expect(editLink(page)).toBeHidden();
});

// The admin panel's second entry point: it links straight into the editor
// rather than to the public page, which would only show a read-only view.
test('the admin panel opens a static page in edit mode', async ({ page }) => {
  await logIn(page);

  await page
    .getByRole('list', { name: 'Content pages' })
    .getByRole('link', { name: 'About us' })
    .click();

  await expect(page).toHaveURL(/\/admin\/pages\/about\/edit\b/);
  await expect(page.getByLabel('Page title')).toHaveValue(aboutPageSeed.title);

  // Leaving an untouched editor returns to the panel without a prompt.
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/admin$/);
});

test.describe('as an admin', () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
    await page.goto('/about');
    await enableEditMode(page);
  });

  test('opens the editor loaded with the current content', async ({ page }) => {
    await editLink(page).click();

    await expect(page.getByLabel('Page title')).toHaveValue(
      aboutPageSeed.title,
    );
    await expect(page.locator('.ProseMirror')).toContainText('What we do');
  });

  test('applies formatting through the toolbar', async ({ page }) => {
    await editLink(page).click();

    const body = page.locator('.ProseMirror');
    await body.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('Bold statement');
    await page.keyboard.press('ControlOrMeta+A');
    await page.getByRole('button', { name: 'Bold' }).click();

    await expect(body.locator('strong')).toHaveText('Bold statement');
  });

  test('adds a link through the in-app panel', async ({ page }) => {
    await editLink(page).click();
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
    await editLink(page).click();
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

  test('uploads a pasted image instead of embedding it in the document', async ({
    page,
  }) => {
    await editLink(page).click();
    const body = page.locator('.ProseMirror');
    await body.click();

    // Pasting an image file: the editor must upload it and reference the stored
    // copy. A blob:/data: URL here would look fine and die with the tab.
    await body.evaluate((element, base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([bytes], 'pasted.png', { type: 'image/png' }),
      );
      element.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: transfer,
          bubbles: true,
          cancelable: true,
        }),
      );
    }, TINY_PNG_BASE64);

    await expect(body.locator('img')).toHaveAttribute(
      'src',
      /^\/media\/[0-9a-f]{12}\.webp$/,
    );
  });

  test('leaves no toolbar button pressed until a caret is placed', async ({
    page,
  }) => {
    // This page opens with a heading, so the pre-focus selection at the start of
    // the document would light up the heading button with no caret to show why.
    await page.goto('/conditions');
    await editLink(page).click();

    const body = page.locator('.ProseMirror');
    await expect(body).toBeVisible();
    const pressed = page.locator(
      '[role="toolbar"] button[aria-pressed="true"]',
    );
    await expect(pressed).toHaveCount(0);

    // Clicking into that same heading is what makes the button light up.
    await body.locator('h2').first().click();

    // Exact: "Subheading" would match too.
    await expect(
      page.getByRole('button', { name: 'Heading', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('starts the first block flush with the top of the editor', async ({
    page,
  }) => {
    await editLink(page).click();

    // The editor is a preview of the rendered page, which has no gap above its
    // first block; prose's own margin reset stops at the ProseMirror wrapper.
    const marginTop = await page
      .locator('.ProseMirror > :first-child')
      .evaluate((el) => getComputedStyle(el).marginTop);

    expect(marginTop).toBe('0px');
  });

  test('previews the edited page as it will look, then returns to editing', async ({
    page,
  }) => {
    await editLink(page).click();
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
    await editLink(page).click();
    await page.getByLabel('Page title').fill('Never saved');

    await page.getByRole('button', { name: 'Cancel' }).click();
    await discardChanges(page);

    // The editor was opened from the page itself, so cancelling goes back
    // there rather than to the admin panel — and nothing was persisted.
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.locator('h1')).toHaveText(aboutPageSeed.title);
  });

  const legalPrivacyLink = (page: Page) =>
    page.getByRole('navigation', { name: 'Legal' }).getByRole('link', {
      name: 'Privacy',
    });

  test('keeps the editor open when a page switch is declined', async ({
    page,
  }) => {
    await editLink(page).click();
    await page.getByLabel('Page title').fill('Unsaved edit');

    await legalPrivacyLink(page).click();
    await keepEditing(page);

    await expect(page).toHaveURL(/\/admin\/pages\/about\/edit\b/);
    await expect(page.getByLabel('Page title')).toHaveValue('Unsaved edit');
  });

  test('abandons the edit and lands in read mode when the switch is confirmed', async ({
    page,
  }) => {
    await editLink(page).click();
    await page.getByLabel('Page title').fill('Unsaved edit');

    await legalPrivacyLink(page).click();
    await discardChanges(page);

    await expect(page).toHaveURL(/\/privacy$/);
    // A fresh page, in read mode — the abandoned edit did not carry over.
    await expect(page.getByLabel('Page title')).toBeHidden();
    await expect(editLink(page)).toBeVisible();
  });
});

// A tiny 2x2 RGBA PNG produced by sharp — small, but a real encode the server's
// libvips fully decodes. (A hand-crafted 1x1 PNG passes the header sniff but
// trips "libpng read error" on the full pixel decode in the runtime's libvips.)
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWPI9zP/D8IMMAYAQwwHzSg0SO0AAAAASUVORK5CYII=';
