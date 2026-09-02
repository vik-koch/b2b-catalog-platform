import { expect, Page, test } from '@playwright/test';
import { localtestEnv } from './support/localtest';

const env = localtestEnv();
const ADMIN_EMAIL = env['ADMIN_EMAIL'];
const ADMIN_PASSWORD = env['ADMIN_PASSWORD'];

/*
 * The admin grids (FR-ADM-05) in a real browser.
 *
 * Everything else about them is unit-tested, but the two things this refactor
 * turns on cannot be reached from jsdom: a table's columns are measured from
 * the layout the browser gives them, and a boundary is dragged with a pointer.
 * A test DOM lays nothing out, so there both are no-ops.
 *
 * Read-only — the suite shares one database with specs that assert seeded
 * state, and nothing here saves anything but a column width.
 */

async function logIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** The rendered width of each column, which is what a `<colgroup>` decides. */
async function columnWidths(page: Page): Promise<number[]> {
  return page
    .locator('thead th')
    .evaluateAll((cells) =>
      cells.map((cell) => Math.round(cell.getBoundingClientRect().width)),
    );
}

test.describe('admin grids on a desktop', () => {
  test.skip(
    ({ isMobile }) => !!isMobile,
    'a phone gets the list of records, which has no columns to measure',
  );

  test('measures the columns from their content, then holds them still', async ({
    page,
  }) => {
    await logIn(page);
    await page.goto('/admin/orders');
    await expect(page.locator('tbody tr').first()).toBeVisible();

    // Frozen after the first laid-out render: the widths come from the content,
    // and from then on the table is fixed so paging cannot move them.
    await expect(page.locator('colgroup col').first()).toBeAttached();
    const table = page.locator('table');
    await expect(table).toHaveClass(/table-fixed/);

    const before = await columnWidths(page);
    // Narrowing the list swaps every row underneath the same columns.
    await page.getByLabel('Filter by status').selectOption('requested');
    await expect(page).toHaveURL(/status=requested/);
    expect(await columnWidths(page)).toEqual(before);
  });

  test('drags a boundary, and remembers where it was left', async ({
    page,
  }) => {
    await logIn(page);
    await page.goto('/admin/orders');
    await expect(page.locator('tbody tr').first()).toBeVisible();

    const before = await columnWidths(page);
    const handle = page.locator('thead th [role="separator"]').first();
    const box = await handle.boundingBox();
    if (!box) throw new Error('the first column has no boundary to drag');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, {
      steps: 10,
    });
    await page.mouse.up();

    const after = await columnWidths(page);
    // What the first column gains, the second gives up: the table is still as
    // wide as it was, so nothing else on the row moved.
    expect(after[0]).toBeGreaterThan(before[0] + 40);
    expect(after[1]).toBeLessThan(before[1] - 40);
    expect(sum(after)).toBeCloseTo(sum(before), 0);

    // Kept across a reload, per grid and per admin.
    await page.reload();
    await expect(page.locator('tbody tr').first()).toBeVisible();
    expect((await columnWidths(page))[0]).toBeCloseTo(after[0], 0);

    // And thrown away again on request, which measures the content afresh.
    await page.getByRole('button', { name: 'Reset column widths' }).click();
    await expect
      .poll(async () => (await columnWidths(page))[0])
      .toBeCloseTo(before[0], 0);
  });

  // A photo and a row of buttons need what they need; a share of the table is
  // the wrong way to describe either, and the share would change with the
  // window.
  test('holds the fixed columns to their pixels at any width', async ({
    page,
  }) => {
    await logIn(page);
    await page.goto('/admin/products');
    await expect(page.locator('tbody tr').first()).toBeVisible();

    const wide = await columnWidths(page);
    await page.setViewportSize({ width: 900, height: 900 });
    await expect.poll(async () => (await columnWidths(page))[0]).toBe(wide[0]);

    const narrow = await columnWidths(page);
    // The thumbnail and the actions kept their pixels; the columns between them
    // gave up the difference.
    expect(narrow[0]).toBe(wide[0]);
    expect(narrow.at(-1)).toBe(wide.at(-1));
    expect(sum(narrow)).toBeLessThan(sum(wide));

    // Neither fixed column owns a boundary: there is one for each pair of
    // neighbours that actually has a share to trade — five flexible columns
    // between the thumbnail and the actions.
    const handles = page.locator('thead th [role="separator"]');
    await expect(handles).toHaveCount(4);
  });
});

test.describe('admin grids on a phone', () => {
  // Also under the desktop project, at a phone's width: the shape is chosen by
  // how wide the window is, and nothing here needs a touch screen.
  test.use({ viewport: { width: 390, height: 780 } });

  test('reads the orders as records, and can still narrow them', async ({
    page,
  }) => {
    await logIn(page);
    await page.goto('/admin/orders');

    // No table to scan across: one record per line, read downwards.
    await expect(page.locator('app-admin-grid table')).toHaveCount(0);
    await expect(page.locator('app-admin-grid li').first()).toBeVisible();

    // The filters live in the column headings, and there are none here — so
    // one disclosure carries all of them, opened in place rather than over the
    // rows it is narrowing.
    // By what it opens, not by its name: the name gains the count of filters
    // in effect, and "Filters" alone also matches "Clear filters" beside it.
    const filters = page.locator('button[aria-controls="grid-filters-panel"]');
    await filters.click();
    await page.getByLabel('Filter by status').selectOption('requested');
    await expect(page).toHaveURL(/status=requested/);
    await expect(filters).toContainText('1');
  });
});

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
