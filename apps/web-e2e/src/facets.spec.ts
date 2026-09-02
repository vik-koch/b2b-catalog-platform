import { expect, Page, test } from '@playwright/test';

/**
 * FR-ATTR-04…07. The panel itself is unit-tested; what only a browser can show
 * is the round trip — a tick reaches the URL, the URL is what the server reads
 * back, and the document a crawler is handed says which URL the content really
 * lives at.
 *
 * `/catalog/filter` is the seeded scope: three products, one Origin each
 * (Colombia, Ethiopia, Kenya) and a Roast level shared by two of them.
 */

/** Product tiles, by the one thing every tile has: a link to its product. */
const tiles = (page: Page) => page.locator('li:has(a[href^="/product/"])');

/**
 * The disclosure's own toggle, found by what it opens rather than by its name:
 * the name gains the count of what is ticked, and "Filters" also matches the
 * clear-all button beside it.
 */
const filtersToggle = (page: Page) =>
  page.locator('button[aria-controls="facet-panel"]');

/**
 * The panel is the left column from `lg` up and a disclosure below it, so every
 * test opens it first where it is closed.
 */
async function openFilters(page: Page, isMobile: boolean) {
  if (isMobile) {
    await filtersToggle(page).click();
  }
  return page.getByRole('group', { name: 'Filters' });
}

/** Waits out the in-place reload: a listing keeps the previous results on
 * screen while the next page is fetched, and a bare count read does not retry
 * long enough to be sure which of the two it saw. */
async function settled(page: Page) {
  await expect(page.locator('section[aria-busy="true"]')).toHaveCount(0);
}

test('filters a listing from the panel and keeps the selection in the URL', async ({
  page,
  isMobile,
}) => {
  await page.goto('/catalog/filter');
  await expect(tiles(page)).toHaveCount(3);

  const panel = await openFilters(page, isMobile);
  await panel.getByRole('checkbox', { name: 'Kenya' }).check();

  await expect(page).toHaveURL(/attr=origin(%3A|:)Kenya/);
  await settled(page);
  await expect(tiles(page)).toHaveCount(1);
  await expect(
    page.getByRole('link', { name: 'Kenya AB Filter' }).first(),
  ).toBeVisible();
});

test('restores a shared filtered link, ticked, and clears it again', async ({
  page,
  isMobile,
}) => {
  await page.goto('/catalog/filter?attr=origin:Kenya');
  await settled(page);
  await expect(tiles(page)).toHaveCount(1);

  const panel = await openFilters(page, isMobile);
  await expect(panel.getByRole('checkbox', { name: 'Kenya' })).toBeChecked();

  // Beside the panel rather than inside it — it undoes what the panel holds,
  // so on a phone it cannot live in the part that closes. Only one of its two
  // copies (column heading, disclosure row) is ever on screen.
  await page
    .getByRole('button', { name: 'Clear all filters' })
    .locator('visible=true')
    .click();

  await expect(page).not.toHaveURL(/attr=/);
  await settled(page);
  await expect(tiles(page)).toHaveCount(3);
});

test('names the selection in a chip that removes it', async ({
  page,
  isMobile,
}) => {
  // The chip row is hidden below `md`, where the title row is too narrow for
  // it; the count on the Filters disclosure reports the selection there.
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(isMobile, 'the chips are a desktop affordance');
  await page.goto('/catalog/filter?attr=origin:Kenya');
  await settled(page);

  const chips = page.getByRole('list', { name: 'Applied filters' });
  await expect(chips).toContainText('Origin: Kenya');

  await chips.getByRole('button', { name: 'Remove the filter' }).click();

  await expect(page).not.toHaveURL(/attr=/);
  await settled(page);
  await expect(tiles(page)).toHaveCount(3);
});

test('reports the selection on the disclosure where the chips do not fit', async ({
  page,
  isMobile,
}) => {
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(!isMobile, 'the disclosure is the narrow-screen affordance');
  await page.goto('/catalog/filter?attr=origin:Kenya');

  await expect(filtersToggle(page)).toContainText('(1)');
});

test('says so when the selection matches nothing, without taking the panel away', async ({
  page,
  isMobile,
}) => {
  await page.goto('/catalog/filter?attr=origin:Kenya&attr=roast-level:Medium');
  await settled(page);

  await expect(tiles(page)).toHaveCount(0);
  await expect(page.getByText('No products match')).toBeVisible();
  // The dead end has to be undoable from where it happened.
  const panel = await openFilters(page, isMobile);
  await expect(panel.getByRole('checkbox', { name: 'Kenya' })).toBeChecked();
});

test('points a filtered listing at the plain category (NFR-SEO-04)', async ({
  page,
}) => {
  await page.goto('/catalog/filter?attr=origin:Kenya&sort=price_desc&page=1');

  // The combination of filters, sort and page is a lens on one category, and
  // filters make the URL space combinatorial — so every variant declares the
  // bare category as the content's real address.
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /\/catalog\/filter$/,
  );
});

test('leaves search results without one, being noindex already', async ({
  page,
}) => {
  await page.goto('/search?q=espresso');

  // A view that has excluded itself needs no preferred URL — and a deployment
  // that is itself non-indexable adds a robots meta of its own, so the count is
  // the assertion, not the tag.
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute(
    'content',
    /noindex/,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('server-renders a filtered listing, panel and all', async ({
    page,
    isMobile,
  }) => {
    // The half that would rot silently: the selection is read on the server and
    // the boxes are ticked with the `checked` *attribute*, not a property
    // write, which is the only form that survives into the SSR'd markup.
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(isMobile, 'the panel needs JavaScript to open on narrow screens');
    await page.goto('/catalog/filter?attr=origin:Kenya');

    await expect(tiles(page)).toHaveCount(1);
    const panel = page.getByRole('group', { name: 'Filters' });
    await expect(panel.getByRole('checkbox', { name: 'Kenya' })).toBeChecked();
  });
});
