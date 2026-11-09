import { randomUUID } from 'node:crypto';
import { expect, Page, test } from '@playwright/test';

import { localtestEnv, MAILPIT_API } from '../support/localtest';

/**
 * FR-CART-03/04/07/09, FR-NOTIF-05/06: placing an order request, end to end.
 * The seam between a browser cart, server prices, a zone the API resolves and
 * a guest's way back by mailed token, each tested alone elsewhere.
 * `hafen-espresso` is six to a pack, with a six-piece minimum.
 */

const env = localtestEnv();
const STAFF_INBOX = env['MAIL_STAFF_TO'];

/** Postcode 20359 is in the demo's `city` zone, free from €150. */
const ADDRESS = {
  street: 'Hafenstraße 12',
  postalCode: '20359',
  city: 'Hamburg',
};

interface Caught {
  readonly ID: string;
  readonly Subject: string;
  readonly To: readonly { readonly Address: string }[];
}

async function fillGuest(page: Page, email: string): Promise<void> {
  await page.locator('#contact-name').fill('Ada Lovelace');
  await page.locator('#contact-email').fill(email);
  // The national part alone, as the form draws the code beside it, in the
  // mask's digits.
  await page.locator('#contact-phone').fill('4012345678');

  await fillAddress(page);
}

/**
 * The address, however this deployment asks for it. With a suggestion provider
 * behind it the form opens compact, one "Address" box and a way out, and
 * without one it asks for every field (FR-CART-11). The stack under test has a
 * sidecar only when the environment gives it one, so the spec takes whichever
 * form it finds rather than pinning the run to one of them.
 */
async function fillAddress(page: Page): Promise<void> {
  const manually = page.getByRole('button', {
    name: 'Enter the address manually',
  });
  if (await manually.isVisible()) await manually.click();

  await page.getByLabel('Street and number').fill(ADDRESS.street);
  await page.getByLabel('Postcode').fill(ADDRESS.postalCode);
  // Not `exact`: a required field's label carries its asterisk with it.
  await page.getByLabel('City').fill(ADDRESS.city);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('cart'));
});

test('a guest orders, and the mailed link opens it without a session', async ({
  page,
  request,
}) => {
  // Unique per run, so the sink can be searched for this order alone.
  const email = `e2e-checkout-${randomUUID()}@example.com`;

  await page.goto('/product/hafen-espresso');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.goto('/checkout');

  // Nothing is charged here, and the form says so before it asks anything.
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  await fillGuest(page, email);

  // The zone is advice from the postcode as typed: it quotes a threshold and
  // refuses nothing.
  await expect(page.getByText(/free/i).first()).toBeVisible();

  await page.getByRole('button', { name: 'Review and send' }).click();

  // The read-back is the second screen: everything as submitted, so nothing
  // reaches a manager unread.
  await expect(
    page.getByRole('heading', { name: 'Check your order' }),
  ).toBeVisible();
  await expect(page.getByText('Nothing has been sent yet.')).toBeVisible();
  await expect(page.getByText(ADDRESS.street)).toBeVisible();
  await expect(page.getByText('Ada Lovelace').first()).toBeVisible();

  await page
    .getByRole('button', { name: 'Order with obligation to pay' })
    .click();

  await expect(
    page.getByRole('heading', { name: 'Thank you — we have your order' }),
  ).toBeVisible();
  // The reference is what the customer quotes on the phone.
  const confirmation = await page
    .getByText(/Your order request is/)
    .innerText();
  const reference = /\b(CK\d{6}-\d{4})\b/.exec(confirmation)?.[1] ?? '';
  expect(reference).not.toBe('');

  // Placing it empties the cart: what was ordered is no longer waiting to be.
  await expect(page.getByRole('link', { name: /^Cart/ })).toHaveAttribute(
    'aria-label',
    /^Cart: .+, lines: 0$/,
  );

  // Both mails: the customer's way back, and the shop's copy (FR-NOTIF-05/06).
  let caught: Caught[] = [];
  await expect
    .poll(async () => {
      const res = await request.get(`${MAILPIT_API}/search`, {
        params: { query: reference },
      });
      caught = ((await res.json()) as { messages: Caught[] }).messages;
      return caught.length;
    })
    .toBe(2);

  const staff = caught.find((m) =>
    m.To.some((to) => to.Address === STAFF_INBOX),
  );
  const customer = caught.find((m) => m.To.some((to) => to.Address === email));
  expect(staff).toBeDefined();
  expect(customer).toBeDefined();

  const body = await request.get(`${MAILPIT_API}/message/${customer?.ID}`);
  const { HTML } = (await body.json()) as { HTML: string };
  const tokenPath = /\/orders\/[\w-]+/.exec(HTML)?.[0] ?? '';
  expect(tokenPath).not.toBe('');

  // The token is the whole credential: no session exists here, and the page
  // opens on it alone.
  await page.context().clearCookies();
  await page.goto(tokenPath);

  // The order's page leads with the reference; "Your order" is the title,
  // not the heading.
  await expect(page).toHaveTitle(/Your order/);
  await expect(
    page.getByRole('heading', { level: 1, name: reference }),
  ).toBeVisible();
  await expect(page.getByText('Hafen Espresso')).toBeVisible();
  // Kept out of the index, and out of any referrer it would otherwise leak to.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    /noindex/,
  );
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute(
    'content',
    'no-referrer',
  );
});

test('refuses to send an order it cannot fill in, and says where', async ({
  page,
}) => {
  await page.goto('/product/hafen-espresso');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.goto('/checkout');

  // Nothing filled at all: the refusal is the form's own, not the server's.
  await page.getByRole('button', { name: 'Review and send' }).click();

  await expect(page.getByText(/Some answers are missing/)).toBeVisible();
  // Still on the form: a refused submission never reaches the read-back.
  await expect(
    page.getByRole('heading', { name: 'Check your order' }),
  ).toHaveCount(0);
  await expect(page.getByText('Please tell us who to ask for.')).toBeVisible();
});

test('collecting it asks where from, and drops the delivery address', async ({
  page,
}) => {
  await page.goto('/product/hafen-espresso');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.goto('/checkout');

  // Clicked on the card's own hit area rather than `.check()`ed on the input:
  // the card lays an overlay over its whole surface, and that overlay is what
  // a customer hits.
  await page
    .locator('ui-choice-card')
    .filter({ hasText: 'Self-pickup' })
    .locator('label')
    .click();
  await expect(page.getByRole('radio', { name: /Self-pickup/ })).toBeChecked();

  // Pickup trades the delivery address for a collection point; the invoice
  // address, the order's, is still asked.
  await expect(page.getByText('Where should we deliver?')).toHaveCount(0);
  await expect(page.getByText('Where should the invoice go?')).toBeVisible();

  // Two points is a real question, so none is chosen, and a submission
  // without one says so.
  await page.getByRole('button', { name: 'Review and send' }).click();
  await expect(
    page.getByText('Please choose where you would like to collect your order.'),
  ).toBeVisible();
});
