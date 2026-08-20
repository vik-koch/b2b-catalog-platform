import { expect, Locator, Page, test } from '@playwright/test';
import { productSeeds } from '@b2b-catalog-platform/seed';
import { localtestEnv } from './support/localtest';

const env = localtestEnv();
const ADMIN_EMAIL = env['ADMIN_EMAIL'];
const ADMIN_PASSWORD = env['ADMIN_PASSWORD'];

/*
 * The product attribute grid (FR-CAT-05, FR-ATTR-10) in a real browser.
 *
 * Everything else about the grid is unit-tested, but its hardest bugs are not
 * reachable from jsdom: they are what Chrome does to a `contenteditable` table
 * when a selection escapes the cell it began in. Left alone, typing over such a
 * selection writes into the *key* column and can take a whole row with it. So
 * these tests make the selection with a real mouse drag.
 *
 * Desktop only: under touch emulation a mouse drag makes no selection at all
 * (the pointer just moves the caret), so there is nothing here to test — a
 * touch selection is made by long-press and handles, a different interaction.
 *
 * Deliberately never saves — like the other admin specs, the suite shares one
 * database with specs that assert seeded state.
 */

const product = productSeeds.find((p) => p.attributes.length > 1);
if (!product)
  throw new Error('missing seed fixture: a product with attributes');
const [first, second] = product.attributes;

async function logIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

const cell = (page: Page, row: number, col: 0 | 1): Locator =>
  page.locator(
    `app-product-attributes-editor tbody tr:nth-child(${row + 1}) [data-col="${col}"]`,
  );

/**
 * Drag from one point of a cell to another, the way a text selection is made.
 *
 * The grid is scrolled to first, and deliberately not by `boundingBox` alone:
 * the mouse API takes viewport coordinates and, unlike a click, never scrolls
 * to what it is aimed at. Off-screen, every drag here lands somewhere else
 * entirely and the whole suite tests nothing.
 */
async function dragBetween(
  page: Page,
  from: { cell: Locator; at: number },
  to: { cell: Locator; at: number },
): Promise<void> {
  await from.cell.scrollIntoViewIfNeeded();
  await to.cell.scrollIntoViewIfNeeded();
  const a = await from.cell.boundingBox();
  const b = await to.cell.boundingBox();
  if (!a || !b) throw new Error('a grid cell is not rendered');
  await page.mouse.move(a.x + a.width * from.at, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * to.at, b.y + b.height / 2, {
    steps: 15,
  });
  await page.mouse.up();
}

/** Which cells the current selection reaches, as "row:col" (or the action cell). */
const selectionCells = (page: Page) =>
  page.evaluate(() => {
    const selection = getSelection();
    const cellOf = (node: Node | null | undefined) => {
      const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      const found = (el as Element | null)?.closest?.('[data-col]');
      return found
        ? `${found.getAttribute('data-row')}:${found.getAttribute('data-col')}`
        : 'outside';
    };
    return {
      anchor: cellOf(selection?.anchorNode),
      focus: cellOf(selection?.focusNode),
    };
  });

test.describe('the product attribute grid', () => {
  test.skip(
    ({ isMobile }) => !!isMobile,
    'a mouse drag selects nothing under touch emulation',
  );

  test.beforeEach(async ({ page }) => {
    await logIn(page);
    await page.goto(`/admin/products/${product.slug}/edit`);
    await expect(cell(page, 0, 0)).toHaveText(first.key);
  });

  test('types into the cell the drag began in, never the key column', async ({
    page,
  }) => {
    // Dragging out of a cell stops being a text selection: Chrome switches to
    // selecting whole cells, and a selection begun in the value column grows
    // over the key column beside it.
    await dragBetween(
      page,
      { cell: cell(page, 0, 1), at: 0.9 },
      { cell: cell(page, 0, 0), at: 0.1 },
    );

    await page.keyboard.type('P');

    await expect(cell(page, 0, 1)).toHaveText('P');
    // Native behaviour writes the character here and empties the value.
    await expect(cell(page, 0, 0)).toHaveText(first.key);
  });

  test('clears both values, and no key, when Delete spans two rows', async ({
    page,
  }) => {
    // The other direction of the same rule: a drag down the value column is a
    // genuine two-cell selection, so both values go and the keys stay.
    await dragBetween(
      page,
      { cell: cell(page, 0, 1), at: 0.1 },
      { cell: cell(page, 1, 1), at: 0.9 },
    );

    await page.keyboard.press('Delete');

    await expect(cell(page, 0, 1)).toHaveText('');
    await expect(cell(page, 1, 1)).toHaveText('');
    await expect(cell(page, 0, 0)).toHaveText(first.key);
    await expect(cell(page, 1, 0)).toHaveText(second.key);
  });

  test('keeps the row below when a selection spans two rows', async ({
    page,
  }) => {
    await dragBetween(
      page,
      { cell: cell(page, 0, 1), at: 0.1 },
      { cell: cell(page, 1, 1), at: 0.9 },
    );

    await page.keyboard.type('P');

    // Native behaviour merges the two rows into one.
    await expect(cell(page, 1, 0)).toHaveText(second.key);
    await expect(cell(page, 1, 1)).toHaveText(second.value);
  });

  test('a drag past the row badges stays inside the value cell', async ({
    page,
  }) => {
    // The status badge is positioned over the value cell, but its DOM belongs
    // to the action cell — inside the editable host. Without `select-none` the
    // selection anchors there and the row's controls join the selection.
    await dragBetween(
      page,
      { cell: cell(page, 0, 1), at: 0.1 },
      { cell: cell(page, 0, 1), at: 1.4 },
    );

    expect(await selectionCells(page)).toEqual({ anchor: '0:1', focus: '0:1' });
  });

  test('clears the cell the drag began in on Delete, and leaves the caret there', async ({
    page,
  }) => {
    // The same grown selection as the typing case, and the same rule: Delete
    // clears what was dragged over, not the key column Chrome added to it.
    await dragBetween(
      page,
      { cell: cell(page, 0, 1), at: 0.9 },
      { cell: cell(page, 0, 0), at: 0.1 },
    );

    await page.keyboard.press('Delete');

    // Native behaviour empties both cells: the key is in the selection only
    // because Chrome put it there.
    await expect(cell(page, 0, 1)).toHaveText('');
    await expect(cell(page, 0, 0)).toHaveText(first.key);

    // Where the caret landed, said the way the user finds out: the next
    // character has to continue the value, not start rewriting the key.
    await page.keyboard.type('X');
    await expect(cell(page, 0, 1)).toHaveText('X');
    await expect(cell(page, 0, 0)).toHaveText(first.key);
  });

  test('hands a key to the inventory, opened and scrolled to', async ({
    page,
  }) => {
    // The grid's way out: "what does the rest of the catalog call this, and
    // with which values?". Opening the row is half the answer — the list is
    // alphabetical, so the row is usually far below the fold.
    const link = page
      .locator(`app-product-attributes-editor tbody tr:nth-child(1) a`)
      .first();
    await link.scrollIntoViewIfNeeded();
    const href = await link.getAttribute('href');
    expect(href).toContain('/admin/attributes/inventory?key=');

    await page.goto(href as string);

    const row = page.locator(`li#attribute-${first.key.replace(/\s+/g, '_')}`);
    await expect(row.getByRole('button', { expanded: true })).toBeVisible();
    // In view, not merely rendered — the point of the anchor.
    await expect(row).toBeInViewport();
  });

  test('undoes a typed-over selection in one step', async ({ page }) => {
    await dragBetween(
      page,
      { cell: cell(page, 0, 1), at: 0.9 },
      { cell: cell(page, 0, 0), at: 0.1 },
    );
    await page.keyboard.type('P');
    await expect(cell(page, 0, 1)).toHaveText('P');

    await page.keyboard.press('Control+z');

    await expect(cell(page, 0, 1)).toHaveText(first.value);
  });
});
