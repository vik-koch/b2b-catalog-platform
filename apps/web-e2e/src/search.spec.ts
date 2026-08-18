import { productSeeds } from '@b2b-catalog-platform/seed';
import { expect, Page, test } from '@playwright/test';

/** A seeded product whose name has a distinctive first word to search for. */
const product = productSeeds.find((p) => p.name === 'Hafen Espresso');
if (!product) throw new Error('No seeded product named "Hafen Espresso"');

/**
 * The search field is inline in the header on desktop and behind a toggle on
 * mobile, so every test starts by making sure there is one to type into.
 */
async function openSearch(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole('button', { name: 'Open search' }).click();
  }
  return page.getByRole('combobox', { name: 'Search products' });
}

test('suggests product names while typing and jumps straight to the product (FR-SEARCH-05)', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  const field = await openSearch(page, isMobile);

  await field.fill('hafen');

  const option = page.getByRole('option', { name: product.name });
  await expect(option).toBeVisible();
  // The typed part is emboldened in place, so the row explains its own match.
  await expect(option.locator('.font-semibold')).toHaveText('Hafen');

  await option.click();

  // Picking a suggestion is a shortcut past the results page entirely.
  await expect(page).toHaveURL(new RegExp(`/product/${product.slug}$`));
  await expect(page.locator('h1')).toHaveText(product.name);
});

test('drives the suggestion list from the keyboard alone', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  const field = await openSearch(page, isMobile);

  await field.fill('hafen');
  await expect(page.getByRole('option', { name: product.name })).toBeVisible();

  await field.press('ArrowDown');
  // The combobox reports its selection by id rather than by moving focus,
  // which is what keeps the caret in the field while the list is walked.
  // Asserted before it is read: a bare getAttribute takes one look and does
  // not wait for the selection to render, which is a race the slower mobile
  // project loses.
  await expect(field).toHaveAttribute('aria-activedescendant', /.+/);
  const activeId = await field.getAttribute('aria-activedescendant');
  const highlighted = String(
    await page.locator(`#${activeId}`).textContent(),
  ).trim();
  expect(highlighted).not.toBe('');

  await field.press('Enter');

  // Asserted against whichever name was highlighted rather than a name picked
  // in advance: which product ranks first is the matcher's business, and this
  // test is about Enter landing on the row the visitor had selected.
  await expect(page).toHaveURL(/\/product\/.+$/);
  await expect(page.locator('h1')).toHaveText(highlighted);
});

test('keeps the full result list reachable by submitting the query', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  const field = await openSearch(page, isMobile);

  // Suggestions are an accelerator only: Enter with no suggestion selected
  // still searches, even while the list is showing.
  await field.fill('espresso');
  await expect(page.getByRole('option').first()).toBeVisible();
  await field.press('Enter');

  await expect(page).toHaveURL(/\/search\?q=espresso$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'espresso',
  );
});

test('says so when a query matches nothing, rather than hiding the list', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  const field = await openSearch(page, isMobile);

  await field.fill('zzzzqqq');

  // Not the live region, which carries the same words for screen readers —
  // this is the message on screen, in the panel itself.
  await expect(
    page.locator('p:not([aria-live])', { hasText: 'Nothing found' }),
  ).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(0);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('still searches, because the suggestions sit on top of a real form', async ({
    page,
    isMobile,
  }) => {
    // The one that would silently rot: the field is SSR'd into every page, and
    // a form without action/method submits to the *current* URL — which sends
    // the home page's search box to /?q=… and looks like nothing happened.
    test.skip(isMobile, 'the mobile toggle needs JavaScript to open the field');
    await page.goto('/');

    // Still addressed as a combobox: the role is in the SSR'd markup and does
    // not wait for hydration to appear.
    await page.getByRole('combobox', { name: 'Search products' }).fill('hafen');
    await page.getByRole('button', { name: 'Search' }).click();

    await expect(page).toHaveURL(/\/search\?q=hafen$/);
    // A tile links to its product twice (image and name), so this takes the
    // first rather than asserting on a strict single match.
    await expect(
      page.getByRole('link', { name: product.name }).first(),
    ).toBeVisible();
  });
});

/**
 * FR-SEARCH-04. The control is one native <select> shared by both listings, so
 * these cover the two things that are not the API's job: the choice reaches the
 * URL, and the URL is what the page reads back — which is what makes a sorted
 * listing shareable.
 */
test.describe('sort controls (FR-SEARCH-04)', () => {
  const sortBy = (page: Page) =>
    page.getByRole('combobox', { name: 'Sort by' });

  /**
   * Tile prices in render order, as numbers — the formatting is a deployment
   * concern, the ordering is not.
   *
   * Parsed rather than stripped to digits: a per-piece price can carry three
   * decimals where the stored price covers a whole pack, so "17,117" and
   * "17,30" are not comparable as bare digit runs. The last separator is taken
   * as the decimal one, which holds for either convention at these magnitudes.
   *
   * Waits for the listing to stop loading first: re-sorting keeps the previous
   * results on screen while the new page is fetched, and allTextContents takes
   * one snapshot without retrying, so an unguarded read can catch the old
   * order — or a half-patched list.
   */
  async function prices(page: Page): Promise<number[]> {
    await expect(page.locator('section[aria-busy="true"]')).toHaveCount(0);
    const texts = await page.locator('li p.font-bold').allTextContents();
    return texts.map((text) => {
      const digits = text.replace(/[^\d.,]/g, '');
      const decimal = Math.max(
        digits.lastIndexOf(','),
        digits.lastIndexOf('.'),
      );
      if (decimal === -1) return Number(digits);
      const whole = digits.slice(0, decimal).replace(/[.,]/g, '');
      return Number(`${whole}.${digits.slice(decimal + 1)}`);
    });
  }

  test('sorts a category listing and keeps the choice in the URL', async ({
    page,
  }) => {
    await page.goto('/catalog/espresso');

    await sortBy(page).selectOption('price');

    await expect(page).toHaveURL(/sort=price/);
    const ascending = await prices(page);
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b));

    // The shareable half: the same URL, opened cold, renders the same order.
    await page.reload();
    await expect(sortBy(page)).toHaveValue('price');
    expect(await prices(page)).toEqual(ascending);
  });

  test('returns to the first page, which the new order has renumbered', async ({
    page,
  }) => {
    await page.goto('/catalog/espresso?page=2');

    await sortBy(page).selectOption('price_desc');

    await expect(page).toHaveURL(/sort=price_desc/);
    await expect(page).not.toHaveURL(/page=/);
  });

  test('sorts search results without losing the query', async ({ page }) => {
    await page.goto('/search?q=espresso');

    await sortBy(page).selectOption('price');

    // Both halves of the URL, and the sort first: `q=espresso` is already there
    // from the navigation, so asserting only that would let the read happen
    // while the page still shows the relevance order it arrived in.
    await expect(page).toHaveURL(/sort=price/);
    await expect(page).toHaveURL(/q=espresso/);
    const ascending = await prices(page);
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b));
  });

  test('offers relevance on search only, where a query can rank it', async ({
    page,
  }) => {
    await page.goto('/search?q=espresso');
    await expect(sortBy(page)).toHaveValue('relevance');

    await page.goto('/catalog/espresso');
    await expect(
      sortBy(page).getByRole('option', { name: 'Best match' }),
    ).toHaveCount(0);
  });
});
