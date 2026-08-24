import { inject } from '@angular/core';
import { CanMatchFn, Route, UrlSegment } from '@angular/router';
import { PageSlug, STANDALONE_PAGE_SLUGS } from '@b2b-catalog-platform/shared';
import { DEPLOYMENT_CONFIG } from './config/deployment-config';
import { guestOnly, requireAuth } from './auth/auth.guard';
import { adminTextGuard } from './config/admin-text';
import { maintenanceGate } from './admin/maintenance/maintenance.guard';
import { productUnsavedChangesGuard } from './admin/products/unsaved-changes.guard';
import { userUnsavedChangesGuard } from './admin/users/unsaved-changes.guard';
import { categoryUnsavedChangesGuard } from './admin/categories/unsaved-changes.guard';
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
import { unsavedChangesGuard } from './core/unsaved-changes.guard';

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
    canDeactivate: [userUnsavedChangesGuard],
    loadComponent: () =>
      import('./admin/users/user-editor-page').then((m) => m.UserEditorPage),
  },
  {
    path: 'admin/users/staff/new',
    data: { kind: 'staff' },
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [userUnsavedChangesGuard],
    loadComponent: () =>
      import('./admin/users/user-editor-page').then((m) => m.UserEditorPage),
  },
  {
    // Admin and manager both: which accounts a manager may open is the API's
    // call (a staff account is 404 for them), not a second list of rules here.
    path: 'admin/users/:id/edit',
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    canDeactivate: [userUnsavedChangesGuard],
    loadComponent: () =>
      import('./admin/users/user-editor-page').then((m) => m.UserEditorPage),
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
    canDeactivate: [categoryUnsavedChangesGuard],
    loadComponent: () =>
      import('./admin/categories/category-editor-page').then(
        (m) => m.CategoryEditorPage,
      ),
  },
  {
    path: 'admin/categories/:slug/edit',
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [categoryUnsavedChangesGuard],
    loadComponent: () =>
      import('./admin/categories/category-editor-page').then(
        (m) => m.CategoryEditorPage,
      ),
  },
  {
    path: 'admin/products/new',
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [productUnsavedChangesGuard],
    loadComponent: () =>
      import('./admin/products/product-editor-page').then(
        (m) => m.ProductEditorPage,
      ),
  },
  {
    path: 'admin/products/:slug/edit',
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [productUnsavedChangesGuard],
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
    canDeactivate: [unsavedChangesGuard],
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
  {
    path: ':slug',
    component: StaticPage,
    canMatch: [isPublishedPage],
    canActivate: [maintenanceGate],
  },
  { path: '**', component: NotFoundPage },
];
