/**
 * Who can reach every route the API mounts (NFR-SEC-04).
 *
 * Authentication is opt-in per route — `@Auth(...)` or `@Machine(...)` — so a
 * route that forgets it is open to anyone. This table is the other half: a new
 * route, or a change in who reaches one, fails the API's route-access spec
 * until the table says so, and the change shows up in review. The api-e2e
 * role sweep then knocks on every route with the wrong credentials. A public
 * route states why it is public.
 *
 * Access is read the way the guards decide it at runtime: `public`,
 * `signed-in` (any account), the roles allowed (`admin+manager`), or
 * `machine:<scope>`. Ownership — whose order, whose address — is the
 * handler's job and is not visible here.
 */
const pub = (why: string) => {
  if (!why.trim()) throw new Error('a public route says why it is public');
  return 'public';
};

export const ROUTE_ACCESS: Readonly<Record<string, string>> = {
  // Session
  'POST /api/auth/login': pub('signing in'),
  'POST /api/auth/logout': pub('clears the cookie; harmless without one'),
  'POST /api/auth/register': pub('self-registration, approved by staff'),
  'POST /api/auth/forgot-password': pub('asks for a reset link by address'),
  'GET /api/auth/password-token/:token': pub('the token is the credential'),
  'POST /api/auth/set-password': pub('the token is the credential'),
  'POST /api/auth/sign-in-step/code': pub('second step of a pending sign-in'),
  'POST /api/auth/sign-in-step/call': pub('second step of a pending sign-in'),
  'POST /api/auth/sign-in-step/resend': pub('second step of a pending sign-in'),
  'GET /api/auth/sign-in-step/stand-in/:reference': pub(
    'mailed stand-in for the call; absent with a real provider',
  ),
  'GET /api/auth/me': 'signed-in',
  'POST /api/auth/change-password': 'signed-in',

  // Storefront
  'GET /api/catalog/categories': pub('storefront'),
  'GET /api/catalog/categories/:slug/products': pub('storefront'),
  'GET /api/catalog/featured': pub('storefront'),
  'GET /api/catalog/products': pub('storefront'),
  'GET /api/catalog/products/:slug': pub('storefront'),
  'GET /api/catalog/products/:slug/pairings': pub('storefront'),
  'GET /api/catalog/search': pub('storefront'),
  'GET /api/catalog/search/suggestions': pub('storefront'),
  'GET /api/catalog/sitemap': pub('crawlers'),
  'GET /api/pages/:slug': pub('static pages'),
  'GET /api/maintenance': pub('the gate itself; read by SSR and deploys'),
  'POST /api/inquiry': pub('contact form'),
  'GET /api/addresses/suggestions': pub('checkout and registration forms'),
  'GET /api/companies/suggestions': pub('checkout and registration forms'),

  // Cart and orders
  'POST /api/cart/preview': pub('guests price a cart too'),
  'POST /api/orders': pub('guest checkout'),
  'GET /api/orders/by-token/:token': pub('mailed order link; token-bearing'),
  'GET /api/order-documents/by-token/:token/:kind': pub(
    'mailed order link; token-bearing',
  ),
  'GET /api/order-documents/:reference/:kind': 'signed-in',
  'POST /api/order-documents/:reference/:kind': 'admin+manager',
  'DELETE /api/order-documents/:reference/:kind': 'admin+manager',
  'POST /api/order-documents/:reference/:kind/notify': 'admin+manager',

  // Account
  'GET /api/account/profile': 'signed-in',
  'PATCH /api/account/profile': 'signed-in',
  'POST /api/account/delete': 'signed-in',
  'GET /api/account/addresses': 'signed-in',
  'POST /api/account/addresses': 'signed-in',
  'PUT /api/account/addresses/:id': 'signed-in',
  'DELETE /api/account/addresses/:id': 'signed-in',
  'GET /api/account/orders': 'signed-in',
  'GET /api/account/orders/:reference': 'signed-in',
  'POST /api/account/orders/:reference/cancel': 'signed-in',
  'GET /api/work/counts': 'signed-in',

  // Admin: catalog
  'GET /api/admin/catalog/categories': 'admin',
  'POST /api/admin/catalog/categories': 'admin',
  'PATCH /api/admin/catalog/categories/order': 'admin',
  'PUT /api/admin/catalog/categories/:id': 'admin',
  'DELETE /api/admin/catalog/categories/:id': 'admin',
  'GET /api/admin/catalog/categories/:slug/hidden-products': 'admin',
  'GET /api/admin/catalog/products': 'admin',
  'POST /api/admin/catalog/products': 'admin',
  'GET /api/admin/catalog/products/:slug': 'admin',
  'PUT /api/admin/catalog/products/:slug': 'admin',
  'DELETE /api/admin/catalog/products/:slug': 'admin',
  'DELETE /api/admin/catalog/products/:slug/permanent': 'admin',
  'GET /api/admin/catalog/products/:slug/page': 'admin',
  'PATCH /api/admin/catalog/products/:slug/published': 'admin',
  'POST /api/admin/catalog/products/:slug/restore': 'admin',
  'GET /api/admin/catalog/products/:slug/stranded-pairings': 'admin',
  'GET /api/admin/catalog/filters': 'admin',
  'PUT /api/admin/catalog/filters': 'admin',
  'GET /api/admin/categories/:slug/filters': 'admin',
  'PUT /api/admin/categories/:slug/filters': 'admin',
  'DELETE /api/admin/categories/:slug/filters': 'admin',
  'GET /api/admin/attributes': 'admin',
  'POST /api/admin/attributes': 'admin',
  'PATCH /api/admin/attributes/order': 'admin',
  'PUT /api/admin/attributes/:id': 'admin',
  'DELETE /api/admin/attributes/:id': 'admin',
  'GET /api/admin/attributes/inventory': 'admin',
  'GET /api/admin/attributes/inventory/values': 'admin',
  'POST /api/admin/attributes/inventory/rename-key': 'admin',
  'POST /api/admin/attributes/inventory/rename-value': 'admin',
  'GET /api/admin/documents': 'admin',
  'POST /api/admin/documents': 'admin',
  'GET /api/admin/documents/:id': 'admin',
  'PUT /api/admin/documents/:id': 'admin',
  'DELETE /api/admin/documents/:id': 'admin',
  'POST /api/media': 'admin',
  'POST /api/media/catalog': 'admin',
  'POST /api/media/catalog/square': 'admin',
  'POST /api/media/document': 'admin',
  'GET /api/pages/:slug/versions': 'admin',
  'PUT /api/pages/:slug': 'admin',

  // Admin: pricing
  'GET /api/admin/tiers': 'admin+manager',
  'POST /api/admin/tiers': 'admin',
  'PATCH /api/admin/tiers/order': 'admin',
  'PUT /api/admin/tiers/:id': 'admin',
  'PUT /api/admin/tiers/:id/default': 'admin',
  'DELETE /api/admin/tiers/:id': 'admin',

  // Admin: orders
  'GET /api/admin/orders': 'admin+manager',
  'GET /api/admin/orders/:reference': 'admin+manager',
  'GET /api/admin/orders/:reference/revisions': 'admin+manager',
  'GET /api/admin/orders/:reference/revisions/:number': 'admin+manager',
  'POST /api/admin/orders/:reference/adjustment': 'admin+manager',
  'POST /api/admin/orders/:reference/adjustment/preview': 'admin+manager',
  'POST /api/admin/orders/:reference/notify': 'admin+manager',
  'POST /api/admin/orders/:reference/payment': 'admin+manager',
  'POST /api/admin/orders/:reference/status': 'admin+manager',
  'DELETE /api/admin/orders/:reference/personal-data': 'admin',

  // Admin: people
  'GET /api/admin/users': 'admin+manager',
  'POST /api/admin/users': 'admin+manager',
  'GET /api/admin/users/:id': 'admin+manager',
  'PATCH /api/admin/users/:id': 'admin+manager',
  'DELETE /api/admin/users/:id': 'admin+manager',
  'PATCH /api/admin/users/:id/active': 'admin+manager',
  'POST /api/admin/users/:id/approve': 'admin+manager',
  'POST /api/admin/users/:id/password-link': 'admin+manager',
  'POST /api/admin/users/:id/deletion': 'admin',
  'GET /api/admin/users/:id/consents': 'admin',
  'PUT /api/admin/users/:id/sign-in-step-exemption': 'admin',
  'GET /api/admin/consents': 'admin',
  'POST /api/admin/consents/:id/withdrawal': 'admin',

  // Admin: sync, tokens, settings
  'POST /api/admin/sync/preview': 'admin',
  'POST /api/admin/sync/customers/preview': 'admin',
  'GET /api/admin/sync/runs': 'admin+manager',
  'GET /api/admin/sync/runs/:id': 'admin+manager',
  'POST /api/admin/sync/runs/:id/commit': 'admin+manager',
  'POST /api/admin/sync/runs/:id/discard': 'admin+manager',
  'GET /api/admin/api-tokens': 'admin',
  'POST /api/admin/api-tokens': 'admin',
  'POST /api/admin/api-tokens/:id/revoke': 'admin',
  'GET /api/settings': 'admin',
  'GET /api/settings/changes': 'admin',
  'GET /api/settings/build-info': 'admin+manager',
  'PUT /api/settings/maintenance': 'admin',
  'PUT /api/settings/ownership': 'admin',

  // Machine
  'GET /api/machine/token': 'machine:catalog-sync',
  'POST /api/machine/sync/runs': 'machine:catalog-sync',
  'GET /api/machine/sync/runs/:id': 'machine:catalog-sync',
  'POST /api/machine/sync/failures': 'machine:catalog-sync',
  'GET /api/machine/customers/accounts': 'machine:customer-read',
  'POST /api/machine/sync/customers/runs': 'machine:customer-sync',
  'GET /api/machine/sync/customers/runs/:id': 'machine:customer-sync',
  'POST /api/machine/sync/customers/failures': 'machine:customer-sync',
  'GET /api/machine/orders': 'machine:order-read',
  'GET /api/machine/orders/:reference': 'machine:order-read',
  'POST /api/machine/sync/orders/runs': 'machine:order-sync',
  'GET /api/machine/sync/orders/runs/:id': 'machine:order-sync',
  'POST /api/machine/sync/orders/failures': 'machine:order-sync',
  'POST /api/machine/orders/:reference/documents/:kind': 'machine:order-sync',
  'DELETE /api/machine/orders/:reference/documents/:kind': 'machine:order-sync',
};
