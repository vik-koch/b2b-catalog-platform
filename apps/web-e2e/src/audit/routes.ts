import type { Locator, Page } from '@playwright/test';
import { join } from 'node:path';
import { localtestDbClient, workspaceRoot } from '../support/localtest';

export const ROLES = ['admin', 'editor', 'customer'] as const;
export type Role = (typeof ROLES)[number];

/** The seeded customer the signed-in pages show: two addresses, one order. */
export const CUSTOMER_EMAIL = 'einkauf@cafe-nordlicht.example';

/** Where the sign-in setup keeps each role's session. */
export function stateFile(role: Role): string {
  return join(workspaceRoot, 'tmp/audit', `${role}.json`);
}

export interface AuditRoute {
  /** The snapshot's name; unique across the list. */
  readonly name: string;
  /** A fixed path, or one looked up in the seeded database. */
  readonly path: string | (() => Promise<string>);
  /** Signed out when absent. */
  readonly as?: Role;
  /** Runs before the page opens, e.g. to fill the cart. */
  readonly before?: (page: Page) => Promise<void>;
  /** Brings the open page into the state worth recording. */
  readonly arrange?: (page: Page) => Promise<void>;
  /** Content that differs between two runs on the same data, covered over. */
  readonly mask?: (page: Page) => Locator[];
  /** Like `mask`, by CSS selector, for content that overflows its own box. */
  readonly hide?: string;
}

async function lookUp(sql: string, params: string[]): Promise<string> {
  const client = localtestDbClient();
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>(sql, params);
    if (!rows[0]) throw new Error(`no row for ${params.join(', ')}`);
    return rows[0].id;
  } finally {
    await client.end();
  }
}

function signedInAs(role: Role, routes: AuditRoute[]): AuditRoute[] {
  return routes.map((route) => ({ ...route, as: role }));
}

const userId = (email: string) =>
  lookUp('SELECT id FROM users WHERE email = $1', [email]);

async function addToCart(page: Page, slug: string): Promise<void> {
  await page.goto(`/product/${slug}`);
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  // The cart is the browser's: it is in once it is stored.
  await page.waitForFunction(
    "JSON.parse(localStorage.getItem('cart') ?? '{}').lines?.length > 0",
  );
}

async function submit(page: Page, name: string | RegExp): Promise<void> {
  await page.getByRole('button', { name }).first().click();
}

const STOREFRONT: AuditRoute[] = [
  {
    name: 'home',
    path: '/',
    // A random pick of the featured products on every load, in a strip that
    // runs past its own edge on a phone.
    hide: 'app-featured-row',
  },
  { name: 'catalog', path: '/catalog' },
  { name: 'category-parent', path: '/catalog/coffee-beans' },
  { name: 'category-leaf', path: '/catalog/espresso' },
  { name: 'product-packaged', path: '/product/hafen-espresso' },
  { name: 'product-parts', path: '/product/takeaway-cup-lid-set-400' },
  { name: 'product-variants', path: '/product/stoneware-cup-set' },
  { name: 'product-out-of-stock', path: '/product/nordic-pull' },
  { name: 'search', path: '/search?q=espresso' },
  { name: 'search-empty', path: '/search?q=zzzz' },
  { name: 'cart-empty', path: '/cart' },
  {
    name: 'cart',
    path: '/cart',
    before: (page) => addToCart(page, 'hafen-espresso'),
  },
  {
    name: 'checkout',
    path: '/checkout',
    before: (page) => addToCart(page, 'hafen-espresso'),
  },
  {
    name: 'checkout-errors',
    path: '/checkout',
    before: (page) => addToCart(page, 'hafen-espresso'),
    arrange: (page) => submit(page, /send|place|order/i),
  },
  { name: 'login', path: '/login' },
  {
    name: 'login-error',
    path: '/login',
    arrange: async (page) => {
      await page.getByLabel('Email').fill('nobody@example.com');
      await page
        .getByRole('textbox', { name: 'Password', exact: true })
        .fill('wrong-password');
      await submit(page, 'Log in');
      await page.getByRole('alert').first().waitFor();
    },
  },
  { name: 'register', path: '/register' },
  {
    name: 'register-errors',
    path: '/register',
    arrange: (page) => submit(page, 'Request an account'),
  },
  { name: 'forgot-password', path: '/forgot-password' },
  {
    name: 'contact',
    path: '/contact',
    // A live map from outside, whose tiles and labels render differently.
    mask: (page) => [page.locator('iframe')],
  },
  { name: 'conditions', path: '/conditions' },
  { name: 'page-about', path: '/about' },
  { name: 'page-privacy', path: '/privacy' },
  { name: 'page-imprint', path: '/imprint' },
  { name: 'page-terms', path: '/terms' },
  { name: 'not-found', path: '/no-such-page' },
];

const CUSTOMER = signedInAs('customer', [
  { name: 'customer-product', path: '/product/hafen-espresso' },
  { name: 'customer-account', path: '/account' },
  { name: 'customer-account-edit', path: '/account/edit' },
  { name: 'customer-orders', path: '/account/orders' },
  { name: 'customer-order', path: '/account/orders/CK-260811-4207' },
  { name: 'customer-address-new', path: '/account/addresses/new' },
  {
    name: 'customer-address-edit',
    path: () =>
      lookUp(
        `SELECT a.id FROM addresses a JOIN users u ON u.id = a."userId"
         WHERE u.email = $1 AND a.label = 'Café'`,
        [CUSTOMER_EMAIL],
      ).then((id) => `/account/addresses/${id}/edit`),
  },
  { name: 'customer-change-password', path: '/change-password' },
  {
    name: 'customer-checkout',
    path: '/checkout',
    before: (page) => addToCart(page, 'hafen-espresso'),
  },
]);

const EDITOR = signedInAs('editor', [
  { name: 'editor-category', path: '/catalog/coffee-beans' },
  { name: 'editor-product', path: '/product/hafen-espresso' },
  { name: 'editor-page', path: '/about' },
]);

const ADMIN = signedInAs('admin', [
  { name: 'admin-panel', path: '/admin' },
  { name: 'admin-products', path: '/admin/products' },
  { name: 'admin-product-new', path: '/admin/products/new' },
  {
    name: 'admin-product-new-errors',
    path: '/admin/products/new',
    arrange: (page) => submit(page, /^(save|create)/i),
  },
  {
    name: 'admin-product-packaged',
    path: '/admin/products/hafen-espresso/edit',
  },
  {
    name: 'admin-product-parts',
    path: '/admin/products/takeaway-cup-lid-set-400/edit',
  },
  {
    name: 'admin-product-variants',
    path: '/admin/products/stoneware-cup-set/edit',
  },
  { name: 'admin-categories', path: '/admin/categories' },
  { name: 'admin-category-new', path: '/admin/categories/new' },
  { name: 'admin-category-edit', path: '/admin/categories/coffee-beans/edit' },
  {
    name: 'admin-category-filters',
    path: '/admin/categories/coffee-beans/filters',
  },
  { name: 'admin-catalog-filters', path: '/admin/catalog/filters' },
  { name: 'admin-attributes', path: '/admin/attributes' },
  { name: 'admin-attribute-inventory', path: '/admin/attributes/inventory' },
  { name: 'admin-tiers', path: '/admin/tiers' },
  { name: 'admin-users', path: '/admin/users' },
  { name: 'admin-staff', path: '/admin/users/staff' },
  { name: 'admin-user-new', path: '/admin/users/new' },
  { name: 'admin-staff-new', path: '/admin/users/staff/new' },
  {
    name: 'admin-user-detail',
    path: () => userId(CUSTOMER_EMAIL).then((id) => `/admin/users/${id}`),
  },
  {
    name: 'admin-user-edit',
    path: () => userId(CUSTOMER_EMAIL).then((id) => `/admin/users/${id}/edit`),
  },
  { name: 'admin-orders', path: '/admin/orders' },
  { name: 'admin-order-requested', path: '/admin/orders/CK-260817-1183' },
  { name: 'admin-order-ready', path: '/admin/orders/CK-260811-4207' },
  { name: 'admin-order-completed', path: '/admin/orders/CK-260820-6640' },
  { name: 'admin-order-adjust', path: '/admin/orders/CK-260817-1183/adjust' },
  {
    name: 'admin-order-revision',
    path: '/admin/orders/CK-260817-1183/revisions/1',
  },
  { name: 'admin-documents', path: '/admin/documents' },
  { name: 'admin-document-new', path: '/admin/documents/new' },
  {
    name: 'admin-document-edit',
    path: () =>
      lookUp('SELECT id FROM documents WHERE title = $1', [
        'Certificate of analysis',
      ]).then((id) => `/admin/documents/${id}/edit`),
  },
  { name: 'admin-page-edit', path: '/admin/pages/about/edit' },
  { name: 'admin-sync-catalog', path: '/admin/sync/catalog' },
  { name: 'admin-sync-catalog-new', path: '/admin/sync/catalog/new' },
  { name: 'admin-sync-customers', path: '/admin/sync/customers' },
  { name: 'admin-sync-orders', path: '/admin/sync/orders' },
  { name: 'admin-api-tokens', path: '/admin/api-tokens' },
  { name: 'admin-operations', path: '/admin/operations' },
  { name: 'admin-consents', path: '/admin/consents' },
]);

/** Every page the audit records, signed out first. */
export const AUDIT_ROUTES: readonly AuditRoute[] = [
  ...STOREFRONT,
  ...CUSTOMER,
  ...EDITOR,
  ...ADMIN,
];
