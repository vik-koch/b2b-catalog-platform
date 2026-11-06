import { expect, Page, test } from '@playwright/test';
import { fixtureSeed } from '../support/seed-fixture';

const productSeeds = fixtureSeed.catalog.products;

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

test('suggests products while typing and jumps straight to the product (FR-SEARCH-05)', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  const field = await openSearch(page, isMobile);

  await field.fill('hafen');

  const option = page
    .getByRole('row', { name: product.name })
    .getByRole('gridcell')
    .first();
  await expect(option).toBeVisible();
  // The typed part is marked, so the row explains its match, with the
  // address fields' <mark>.
  await expect(option.locator('mark')).toHaveText('Hafen');

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
  await expect(page.getByRole('row', { name: product.name })).toBeVisible();

  await field.press('ArrowDown');
  // The combobox reports its selection by id rather than by moving focus,
  // which is what keeps the caret in the field while the list is walked.
  // Asserted before it is read: a bare getAttribute takes one look and does
  // not wait for the selection to render, which is a race the slower mobile
  // project loses.
  await expect(field).toHaveAttribute('aria-activedescendant', /.+/);
  const activeId = await field.getAttribute('aria-activedescendant');
  const highlighted = String(
    await page.locator(`#${activeId} ui-highlighted-line`).textContent(),
  ).trim();
  expect(highlighted).not.toBe('');

  await field.press('Enter');

  // Asserted against whichever name was highlighted rather than a name picked
  // in advance: which product ranks first is the matcher's business, and this
  // test is about Enter landing on the row the visitor had selected.
  await expect(page).toHaveURL(/\/product\/.+$/);
  await expect(page.locator('h1')).toHaveText(highlighted);
});

test('adds a product to the cart from its suggestion without leaving the field (FR-SEARCH-06)', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  const field = await openSearch(page, isMobile);

  await field.fill('hafen');
  await page
    .getByRole('button', { name: `Add ${product.name} to cart` })
    .click();

  // The row says so in place, the query still answered: the next product is
  // one press away.
  await expect(
    page.getByRole('img', { name: `${product.name} is in your cart` }),
  ).toBeVisible();
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute('aria-expanded', 'true');

  await page.goto('/cart');
  await expect(
    page.getByRole('heading', { name: product.name, level: 2 }),
  ).toBeVisible();
});

test('offers the categories a query names and opens one (FR-SEARCH-07)', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  const field = await openSearch(page, isMobile);

  await field.fill('espresso');
  const strip = page.getByRole('row', { name: 'Matching categories' });
  // Its parent under the name, since a leaf's name alone may not be unique.
  const chip = strip.getByRole('link', { name: /Espresso Roasts/ });
  await expect(chip).toContainText('Coffee Beans');

  await chip.click();

  await expect(page).toHaveURL(/\/catalog\/espresso$/);
  await expect(strip).toBeHidden();
});

test('reads a query typed on the other keyboard layout (FR-SEARCH-08)', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  const field = await openSearch(page, isMobile);

  // The demo's German keyboard with a US layout active: the key marked Y
  // types a z. The row marks what the other reading matched.
  await field.fill('zirga');
  const option = page
    .getByRole('row', { name: 'Yirgacheffe Filter' })
    .getByRole('gridcell')
    .first();
  await expect(option.locator('mark')).toHaveText('Yirga');
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
  await expect(page.getByRole('row').first()).toBeVisible();
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

  // The message in the panel, not the screen readers' live region.
  await expect(
    page.locator('p:not([aria-live])', { hasText: 'Nothing found' }),
  ).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(0);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('still searches, because the suggestions sit on top of a real form', async ({
    page,
  }) => {
    // The one that would silently rot: the field is SSR'd into every page, and
    // a form without action/method submits to the current URL, sending the
    // home page's box to /?q=…, as if nothing happened.
    await page.goto('/');

    // Still addressed as a combobox: the role is in the SSR'd markup and does
    // not wait for hydration to appear.
    await page.getByRole('combobox', { name: 'Search products' }).fill('hafen');
    // Exact: on a phone the tab bar has a search button of its own.
    await page.getByRole('button', { name: 'Search', exact: true }).click();

    await expect(page).toHaveURL(/\/search\?q=hafen$/);
    // A tile links to its product twice (image and name), so this takes the
    // first rather than asserting on a strict single match.
    await expect(
      page.getByRole('link', { name: product.name }).first(),
    ).toBeVisible();
  });
});

/** FR-SEARCH-04: the choice reaches the URL and the page reads it back, so a
 * sorted listing can be shared. Segments on a wide listing, a native <select>
 * on a phone; each viewport drives its own. */
test.describe('sort controls (FR-SEARCH-04)', () => {
  const sortBy = (page: Page) =>
    page.getByRole('combobox', { name: 'Sort by' });

  /** On a phone the select is inside the Filters disclosure, out of reach
   * until it is opened. */
  async function phoneSortBy(page: Page) {
    const filters = page.locator('button[aria-controls="facet-panel"]');
    if ((await filters.getAttribute('aria-expanded')) !== 'true') {
      await filters.click();
    }
    return sortBy(page);
  }
  const segments = (page: Page) => page.getByRole('group', { name: 'Sort by' });

  async function sortByPrice(
    page: Page,
    isMobile: boolean,
    sort: 'price' | 'price_desc',
  ): Promise<void> {
    if (isMobile) {
      await (await phoneSortBy(page)).selectOption(sort);
      return;
    }
    const price = () => segments(page).getByRole('button', { name: /^Price/ });
    await price().click();
    if (sort === 'price_desc') {
      await expect(page).toHaveURL(/sort=price(&|$)/);
      await price().click();
    }
  }

  /** The accessible name of the order the control says is in effect. */
  async function shownSort(page: Page, isMobile: boolean): Promise<string> {
    if (isMobile) {
      return (await phoneSortBy(page))
        .locator('option:checked')
        .evaluate((o) => o.textContent?.trim() ?? '');
    }
    return (
      (await segments(page)
        .getByRole('button', { pressed: true })
        .getAttribute('aria-label')) ?? ''
    );
  }

  /**
   * Tile prices in render order, as numbers, parsed with the last separator as
   * decimal: a piece price can carry three decimals ("17,117" against
   * "17,30"). Waits for loading to end: re-sorting keeps old results up, and
   * allTextContents reads one snapshot.
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
    isMobile,
  }) => {
    await page.goto('/catalog/espresso');

    await sortByPrice(page, isMobile, 'price');

    await expect(page).toHaveURL(/sort=price/);
    const ascending = await prices(page);
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b));

    // The shareable half: the same URL, opened cold, renders the same order.
    await page.reload();
    expect(await shownSort(page, isMobile)).toBe('Price (low to high)');
    expect(await prices(page)).toEqual(ascending);
  });

  test('turns the chosen field round on a second press', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone offers the orders as a select');
    await page.goto('/catalog/espresso');

    await sortByPrice(page, isMobile, 'price_desc');

    await expect(page).toHaveURL(/sort=price_desc/);
    expect(await shownSort(page, isMobile)).toBe('Price (high to low)');
    const descending = await prices(page);
    expect(descending).toEqual([...descending].sort((a, b) => b - a));
  });

  test('returns to the first page, which the new order has renumbered', async ({
    page,
    isMobile,
  }) => {
    // The whole catalogue, the one listing of the demo that runs to a second
    // page.
    await page.goto('/catalog?page=2');

    await sortByPrice(page, isMobile, 'price_desc');

    await expect(page).toHaveURL(/sort=price_desc/);
    await expect(page).not.toHaveURL(/page=/);
  });

  test('sorts search results without losing the query', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/search?q=espresso');

    await sortByPrice(page, isMobile, 'price');

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
    isMobile,
  }) => {
    await page.goto('/search?q=espresso');
    expect(await shownSort(page, isMobile)).toBe('Best match');

    await page.goto('/catalog/espresso');
    const control = isMobile ? await phoneSortBy(page) : segments(page);
    await expect(control).toBeVisible();
    await expect(
      control.getByRole(isMobile ? 'option' : 'button', {
        name: 'Best match',
      }),
    ).toHaveCount(0);
  });
});
