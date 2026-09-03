import { inject } from '@angular/core';
import { CanMatchFn, Route, UrlSegment } from '@angular/router';
import { PageSlug, STANDALONE_PAGE_SLUGS } from '@b2b-catalog-platform/shared';
import { DEPLOYMENT_CONFIG } from './config/deployment-config';
import { guestOnly, requireAuth } from './auth/auth.guard';
import { adminTextGuard } from './config/admin-text';
import { maintenanceGate } from './admin/maintenance/maintenance.guard';
import { unsavedChangesGuard } from './admin/unsaved-changes.guard';
import { NotFoundPage } from './pages/not-found-page';
import { ContactPage } from './pages/contact-page';
import { InquiryPage } from './pages/inquiry-page';
import { MaintenanceScreen } from './pages/maintenance-screen';
import { Home } from './home/home';
import { CategoryOverview } from './catalog/category-overview';
import { CategoryGrid } from './catalog/category-grid';
import { SearchResults } from './catalog/search-results';
import { ProductDetail } from './catalog/product-detail';
import { StaticPage } from './pages/static-page';

/**
 * The generic page route serves a slug only when the deployment publishes it,
 * so an unpublished page 404s rather than lingering unlinked but reachable.
 */
const publishes = (slug: PageSlug): boolean =>
  (inject(DEPLOYMENT_CONFIG).pages.published as readonly string[]).includes(
    slug,
  );

/** Gate for a code route whose body is a page: unpublishing removes it too. */
const publishesPage =
  (slug: PageSlug): CanMatchFn =>
  () =>
    publishes(slug);

const isPublishedPage: CanMatchFn = (_: Route, [first]: UrlSegment[]) => {
  const slug = first?.path ?? '';
  return (
    (STANDALONE_PAGE_SLUGS as readonly string[]).includes(slug) &&
    publishes(slug as PageSlug)
  );
};

export const appRoutes: Route[] = [
  { path: '', component: Home, canActivate: [maintenanceGate] },
  // Session-scoped routes, lazy so the public bundle carries none of them.
  // Admin routes also wait on adminTextGuard: their wording is fetched rather
  // than injected into the document (see config/admin-text.ts).
  // `layout: 'centered'` is the signed-out treatment: the shell paints a stone
  // background (see app.ts) and the page draws its form in an AuthCard on top.
  // These four are the whole of it — every other route is a page of the app,
  // with content around it that the card would fight.
  {
    path: 'login',
    canActivate: [guestOnly],
    data: { layout: 'centered' },
    loadComponent: () => import('./auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    canActivate: [guestOnly],
    data: { layout: 'centered' },
    loadComponent: () =>
      import('./auth/register-page').then((m) => m.RegisterPage),
  },
  {
    // Guest-only like login: somebody already signed in has the
    // change-password form, which does not need a mailbox round trip.
    path: 'forgot-password',
    canActivate: [guestOnly],
    data: { layout: 'centered' },
    loadComponent: () =>
      import('./auth/forgot-password-page').then((m) => m.ForgotPasswordPage),
  },
  {
    // Reached from an invitation or a reset mail; the link is in the query
    // string, bound to the page's `token` input by withComponentInputBinding.
    path: 'set-password',
    data: { layout: 'centered' },
    loadComponent: () =>
      import('./auth/set-password-page').then((m) => m.SetPasswordPage),
  },
  {
    path: 'admin',
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    loadComponent: () =>
      import('./admin/admin-panel-page').then((m) => m.AdminPanelPage),
  },
  // Product management, admin-only and client-rendered like the panel.
  {
    path: 'admin/products',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('./admin/products/product-list-page').then(
        (m) => m.ProductListPage,
      ),
  },
  {
    path: 'admin/sync',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('./admin/sync/sync-page').then((m) => m.SyncPage),
  },
  // Filterable attributes edit in place too — a definition is four fields,
  // so there is no editor route to pair with this one.
  {
    path: 'admin/attributes',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('./admin/attributes/attribute-list-page').then(
        (m) => m.AttributeListPage,
      ),
  },
  // The inventory is its own route rather than a tab: it is a different
  // question (what is in the catalog, not what the shop filters by) and the
  // drill-down links out of it into the product list.
  {
    path: 'admin/attributes/inventory',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('./admin/attributes/attribute-inventory-page').then(
        (m) => m.AttributeInventoryPage,
      ),
  },
  // Tiers edit in place on one screen — two fields per tier, so no editor
  // route to pair with this one.
  {
    path: 'admin/tiers',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('./admin/tiers/tier-list-page').then((m) => m.TierListPage),
  },
  // Account management, one component in two views. Customers: admin and
  // manager both, since the permission split is on the row actions, not on
  // reaching the list. Staff: admin only — a manager may not even see who the
  // admins are. `kind` reaches the component through route input binding.
  {
    path: 'admin/users',
    data: { kind: 'customer' },
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    loadComponent: () =>
      import('./admin/users/user-list-page').then((m) => m.UserListPage),
  },
  {
    path: 'admin/users/staff',
    data: { kind: 'staff' },
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('./admin/users/user-list-page').then((m) => m.UserListPage),
  },
  // Adding, editing and approving share one screen. The literal `staff/new`
  // stays ahead of `:id/edit` so it is never read as an account id.
  {
    path: 'admin/users/new',
    data: { kind: 'customer' },
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    canDeactivate: [unsavedChangesGuard((t) => t.userEditor.discardConfirm)],
    loadComponent: () =>
      import('./admin/users/user-editor-page').then((m) => m.UserEditorPage),
  },
  {
    path: 'admin/users/staff/new',
    data: { kind: 'staff' },
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [unsavedChangesGuard((t) => t.userEditor.discardConfirm)],
    loadComponent: () =>
      import('./admin/users/user-editor-page').then((m) => m.UserEditorPage),
  },
  {
    // Admin and manager both: which accounts a manager may open is the API's
    // call (a staff account is 404 for them), not a second list of rules here.
    path: 'admin/users/:id/edit',
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    canDeactivate: [unsavedChangesGuard((t) => t.userEditor.discardConfirm)],
    loadComponent: () =>
      import('./admin/users/user-editor-page').then((m) => m.UserEditorPage),
  },
  // Orders, for admin and manager both (FR-AUTH-03) — a manager's daily work.
  // Read-only in this iteration.
  {
    path: 'admin/orders',
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    loadComponent: () =>
      import('./admin/orders/order-list-page').then(
        (m) => m.AdminOrderListPage,
      ),
  },
  {
    // By reference, like the customer's own order page: it is the identity the
    // order is quoted and mailed under.
    path: 'admin/orders/:reference',
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    loadComponent: () =>
      import('./admin/orders/order-detail-page').then(
        (m) => m.AdminOrderDetailPage,
      ),
  },
  {
    path: 'admin/categories',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('./admin/categories/category-list-page').then(
        (m) => m.CategoryListPage,
      ),
  },
  // Creating and editing share one screen, like products.
  {
    path: 'admin/categories/new',
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [
      unsavedChangesGuard((t) => t.categoryEditor.discardConfirm),
    ],
    loadComponent: () =>
      import('./admin/categories/category-editor-page').then(
        (m) => m.CategoryEditorPage,
      ),
  },
  {
    path: 'admin/categories/:slug/edit',
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [
      unsavedChangesGuard((t) => t.categoryEditor.discardConfirm),
    ],
    loadComponent: () =>
      import('./admin/categories/category-editor-page').then(
        (m) => m.CategoryEditorPage,
      ),
  },
  // The category's filter panel (FR-ATTR-11) — its own route rather than a tab
  // of the editor: it edits the attribute registry's placement, not the
  // category's own fields, and it is reached from the storefront grid too.
  {
    path: 'admin/categories/:slug/filters',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('./admin/attributes/category-filters-page').then(
        (m) => m.CategoryFiltersPage,
      ),
  },
  {
    path: 'admin/products/new',
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [unsavedChangesGuard((t) => t.productEditor.discardConfirm)],
    loadComponent: () =>
      import('./admin/products/product-editor-page').then(
        (m) => m.ProductEditorPage,
      ),
  },
  {
    path: 'admin/products/:slug/edit',
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [unsavedChangesGuard((t) => t.productEditor.discardConfirm)],
    loadComponent: () =>
      import('./admin/products/product-editor-page').then(
        (m) => m.ProductEditorPage,
      ),
  },
  // Static-page editing as an admin route, alongside the catalog editors — the
  // only way in, whether from the admin panel or the storefront pencil.
  {
    path: 'admin/pages/:slug/edit',
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [unsavedChangesGuard((t) => t.pageEditor.discardConfirm)],
    // noReuse makes a slug change a fresh activation, so the unsaved-changes
    // guard runs and the editor re-reads its slug (see the strategy).
    data: { noReuse: true },
    loadComponent: () =>
      import('./admin/pages/page-editor-page').then((m) => m.PageEditorPage),
  },
  {
    path: 'account',
    canActivate: [requireAuth()],
    loadComponent: () =>
      import('./account/account-page').then((m) => m.AccountPage),
  },
  {
    path: 'account/edit',
    canActivate: [requireAuth()],
    loadComponent: () =>
      import('./account/account-edit-page').then((m) => m.AccountEditPage),
  },
  // The account's own order history (FR-ACC-01), lazy like the rest of the
  // signed-in area. The page it lands on is read-only: an order is a request,
  // and nothing about one is editable once it is sent.
  {
    path: 'account/orders',
    canActivate: [requireAuth()],
    loadComponent: () =>
      import('./orders/order-list-page').then((m) => m.OrderListPage),
  },
  {
    // The reference is the identity a customer was quoted and a mail links to,
    // so it is what the URL carries — never the row's id.
    path: 'account/orders/:reference',
    canActivate: [requireAuth()],
    loadComponent: () =>
      import('./orders/order-detail-page').then((m) => m.OrderDetailPage),
  },
  // `new` stays ahead of `:id/edit` so it is never read as an address id.
  {
    path: 'account/addresses/new',
    canActivate: [requireAuth()],
    loadComponent: () =>
      import('./addresses/address-editor-page').then(
        (m) => m.AddressEditorPage,
      ),
  },
  {
    path: 'account/addresses/:id/edit',
    canActivate: [requireAuth()],
    loadComponent: () =>
      import('./addresses/address-editor-page').then(
        (m) => m.AddressEditorPage,
      ),
  },
  {
    path: 'account/delete',
    canActivate: [requireAuth()],
    loadComponent: () =>
      import('./account/account-delete-page').then((m) => m.AccountDeletePage),
  },
  {
    path: 'change-password',
    canActivate: [requireAuth()],
    loadComponent: () =>
      import('./auth/change-password-page').then((m) => m.ChangePasswordPage),
  },
  // The order summary a confirmation mail links to (FR-NOTIF-06). Public by
  // capability: the token in the URL is the whole credential, so there is no
  // guard — and no session either, which is the point for a guest. Server-
  // rendered like the rest of the storefront (nothing here is browser-held),
  // and kept out of the index by the page itself.
  {
    path: 'orders/:token',
    canActivate: [maintenanceGate],
    loadComponent: () =>
      import('./orders/order-token-page').then((m) => m.OrderTokenPage),
  },
  // The public maintenance screen (FR-ADM-04). Ungated — it is where the gate
  // sends visitors — and never a page slug, so it sits before the :slug route.
  { path: 'maintenance', component: MaintenanceScreen },
  // Code pages are declared before the generic :slug route. Each public route
  // carries the maintenance gate so the storefront is hidden when it is on.
  // A code route, but its prose is a page body — so publishing governs it the
  // same way, and a deployment without a contact page has no dangling route.
  {
    path: 'contact',
    component: ContactPage,
    canMatch: [publishesPage('contact')],
    canActivate: [maintenanceGate],
  },
  { path: 'inquiry', component: InquiryPage, canActivate: [maintenanceGate] },
  // Open-source attribution (see LicensesPage). Not a page slug and not
  // deployment-configurable: it attributes the code every deployment ships, so
  // it is present wherever the app is. Lazy — a footer link nobody follows
  // twice has no business in the bundle every visitor downloads.
  {
    path: 'licenses',
    canActivate: [maintenanceGate],
    loadComponent: () =>
      import('./pages/licenses-page').then((m) => m.LicensesPage),
  },
  {
    path: 'catalog',
    component: CategoryOverview,
    canActivate: [maintenanceGate],
  },
  {
    path: 'catalog/:slug',
    component: CategoryGrid,
    canActivate: [maintenanceGate],
  },
  // Server-rendered like the rest of the storefront so a shared result link
  // resolves without JavaScript, but kept out of the index (NFR-SEO-04) via the
  // robots meta the component sets.
  {
    path: 'search',
    component: SearchResults,
    canActivate: [maintenanceGate],
  },
  {
    path: 'product/:slug',
    component: ProductDetail,
    canActivate: [maintenanceGate],
  },
  // The cart lives in localStorage, so it is client-rendered and lazy: a
  // visitor who never buys anything does not download it.
  {
    path: 'cart',
    canActivate: [maintenanceGate],
    loadComponent: () => import('./cart/cart-page').then((m) => m.CartPage),
  },
  // Checkout is client-rendered like the cart, and for the same reason: it
  // orders what is in this browser's storage. Open to guests (FR-CART-03):
  // the same form, asking for the contact details an account would have
  // answered, and offering a way to sign in rather than demanding one.
  {
    path: 'checkout',
    canActivate: [maintenanceGate],
    loadComponent: () =>
      import('./checkout/checkout-page').then((m) => m.CheckoutPage),
  },
  {
    path: ':slug',
    component: StaticPage,
    canMatch: [isPublishedPage],
    canActivate: [maintenanceGate],
  },
  { path: '**', component: NotFoundPage },
];
