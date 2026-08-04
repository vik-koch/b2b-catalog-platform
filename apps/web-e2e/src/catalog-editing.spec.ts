import { expect, Page, test } from '@playwright/test';
import { categorySeeds, productSeeds } from '@b2b-catalog-platform/seed';
import { localtestEnv } from './support/localtest';

const env = localtestEnv();
const ADMIN_EMAIL = env['ADMIN_EMAIL'];
const ADMIN_PASSWORD = env['ADMIN_PASSWORD'];

/*
 * Storefront edit mode + admin catalog screens (FR-ADM-01). Like
 * page-editing.spec, this NEVER persists a change — the suite runs in parallel
 * against one database and the catalog specs (navigation, catalog) assert seeded
 * state. Actual writes (create/update/delete/restore) are covered in api-e2e,
 * which owns and restores the database; what is left for the UI is the edit-mode
 * affordances, the editor screen, and the admin lists.
 */

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`missing seed fixture: ${what}`);
  return value;
}

const category = required(
  categorySeeds.find((c) => c.slug === 'espresso'),
  'espresso category',
);
const product = required(
  productSeeds.find((p) => p.categoryKey === 'espresso'),
  'espresso product',
);

const editModeToggle = (page: Page) =>
  page.getByRole('button', { name: 'Edit mode' });

async function logIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test('a signed-out visitor sees no edit-mode toggle', async ({ page }) => {
  await page.goto(`/catalog/${category.slug}`);
  await expect(editModeToggle(page)).toBeHidden();
});

test.describe('as an admin', () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  test('reveals product edit affordances on the category grid only in edit mode', async ({
    page,
  }) => {
    await page.goto(`/catalog/${category.slug}`);

    // Off by default: no add tile, no per-tile edit control.
    await expect(page.getByRole('link', { name: 'Add product' })).toBeHidden();

    await editModeToggle(page).click();
    await expect(
      page.getByRole('button', { name: 'Editing on' }),
    ).toBeVisible();

    await expect(page.getByRole('link', { name: 'Add product' })).toBeVisible();
    // The per-tile controls load lazily (@defer) once edit mode is on.
    await expect(
      page.getByRole('link', { name: 'Edit product' }).first(),
    ).toBeVisible();
  });

  test('shows edit/delete controls on the product page in edit mode', async ({
    page,
  }) => {
    await page.goto(`/product/${product.slug}`);
    await expect(
      page.getByRole('button', { name: 'Delete product' }),
    ).toBeHidden();

    await editModeToggle(page).click();

    await expect(
      page.getByRole('link', { name: 'Edit product' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Delete product' }),
    ).toBeVisible();
  });

  test('opens the product editor with the category preselected, and cancels without saving', async ({
    page,
  }) => {
    await page.goto(`/catalog/${category.slug}`);
    await editModeToggle(page).click();
    await page.getByRole('link', { name: 'Add product' }).click();

    // The `from` param rides along so cancelling returns to this category.
    await expect(page).toHaveURL(
      new RegExp(`/admin/products/new\\?category=${category.slug}\\b`),
    );
    // The editor is a real form; fill the name, then leave without saving.
    const name = page.getByRole('textbox').first();
    await name.fill('E2E never-saved product');

    await page.getByRole('button', { name: 'Cancel' }).click();
    // The unsaved-changes guard prompts through the app's own modal.
    await page
      .getByRole('dialog', { name: 'Discard changes?' })
      .getByRole('button', { name: 'Discard changes' })
      .click();
    await expect(page).not.toHaveURL(/\/admin\/products\/new/);
  });

  // The add-card carries the category it sits under, so the new subcategory
  // lands in the right place without the admin re-picking it.
  test('adds a subcategory from the category page, with the parent preselected', async ({
    page,
  }) => {
    await page.goto(`/catalog/${category.slug}`);
    await editModeToggle(page).click();
    await page.getByRole('link', { name: 'Add category' }).click();

    await expect(page).toHaveURL(
      new RegExp(`/admin/categories/new\\?parent=${category.slug}\\b`),
    );
    await expect(
      page.getByRole('combobox', { name: 'Parent category' }),
    ).toHaveValue(/.+/);

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(new RegExp(`/catalog/${category.slug}$`));
  });

  // Adding used to create a placeholder row the moment it was clicked; now it
  // opens an editor and the category exists only once it is saved. Cancelling
  // must therefore leave the tree exactly as it was — which is also what lets
  // this spec run against the shared database without persisting anything.
  test('opens an editor to add a category, creating nothing until saved', async ({
    page,
  }) => {
    await page.goto('/admin/categories');
    // This screen is client-rendered and fetches its tree after activating, so
    // wait for a known row before counting — `count()` does not retry, and a
    // count taken mid-load would be compared against the loaded one below.
    const rows = page.getByRole('listitem');
    await expect(rows.filter({ hasText: category.name }).first()).toBeVisible();
    const before = await rows.count();

    await page.getByRole('link', { name: 'Add category', exact: true }).click();

    await expect(page).toHaveURL(/\/admin\/categories\/new\b/);
    await expect(
      page.getByRole('heading', { name: 'Add category' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(/\/admin\/categories$/);
    // The tree is exactly as it was — no row was created by opening the editor.
    await expect(rows).toHaveCount(before);
  });

  test('links to the product and category management screens', async ({
    page,
  }) => {
    await page.goto('/admin');

    await page.getByRole('link', { name: 'Products' }).click();
    await expect(page).toHaveURL(/\/admin\/products$/);
    await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();

    await page.goto('/admin');
    await page.getByRole('link', { name: 'Categories' }).click();
    await expect(page).toHaveURL(/\/admin\/categories$/);
    await expect(
      page.getByRole('heading', { name: 'Categories' }),
    ).toBeVisible();
  });
});
