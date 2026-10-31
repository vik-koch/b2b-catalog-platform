import { Route } from '@angular/router';
import { requireAuth } from '../shared/auth/auth.guard';
import { adminTextGuard } from '../shared/config/admin-text';
import { unsavedChangesGuard } from './unsaved-changes.guard';

/*
 * Staff routes, lazy and client-rendered. Each also waits on adminTextGuard:
 * their wording is fetched rather than injected into the document (see
 * config/admin-text.ts).
 */
export const adminRoutes: Route[] = [
  {
    path: 'admin',
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    loadComponent: () =>
      import('./admin-panel-page').then((m) => m.AdminPanelPage),
  },
  // Product management, admin-only and client-rendered like the panel.
  {
    path: 'admin/products',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('./catalog/products/product-list-page').then(
        (m) => m.ProductListPage,
      ),
  },
  // Sync (FR-ADM-02, FR-ADM-07, FR-ADM-09). The log is the screen the panel
  // opens: runs arrive without anybody present now, so "what has happened"
  // comes before "what am I about to upload".
  //
  // One screen per area rather than one with a filter, because who may read
  // them differs — the catalog is an admin's, customers are a manager's too
  // (ADR 0060). The area travels as route data, so the component is told which
  // log it is and the guard beside it is the one that matches.
  //
  // Explicit paths rather than `admin/sync/:area`: the areas are a closed set
  // in code, and a parameter here would also match `runs`.
  //
  // Both redirects are absolute: a `redirectTo` without a leading slash is
  // resolved against the matched route's parent, which turned `/admin/sync`
  // into `/admin/admin/sync/catalog`.
  { path: 'admin/sync', pathMatch: 'full', redirectTo: '/admin/sync/catalog' },
  { path: 'admin/sync/new', redirectTo: '/admin/sync/catalog/new' },
  {
    path: 'admin/sync/catalog',
    data: { area: 'catalog' },
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('./sync/sync-runs-page').then((m) => m.SyncRunsPage),
  },
  {
    path: 'admin/sync/customers',
    data: { area: 'customers' },
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    loadComponent: () =>
      import('./sync/sync-runs-page').then((m) => m.SyncRunsPage),
  },
  // The order exchange's log. A manager's as well as an admin's, for the
  // reason the customer one is: an order run is the work on their own desk
  // arriving from somewhere else (FR-ADM-09). There is no `new` beside it —
  // orders are answered here or over there, never uploaded from a file.
  {
    path: 'admin/sync/orders',
    data: { area: 'orders' },
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    loadComponent: () =>
      import('./sync/sync-runs-page').then((m) => m.SyncRunsPage),
  },
  {
    path: 'admin/sync/catalog/new',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('./sync/sync-upload-page').then((m) => m.SyncUploadPage),
  },
  // The manual customer import (FR-ADM-12), admin-only where reading and
  // answering a customer run are a manager's too: bringing several hundred
  // accounts into being from a file is a deployment act, not the work.
  {
    path: 'admin/sync/customers/new',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('./sync/customer-sync-upload-page').then(
        (m) => m.CustomerSyncUploadPage,
      ),
  },
  // One run page for every area: a run id is unique across them, the page
  // reads the area off the run, and a staged-run link already sitting in
  // somebody's inbox keeps working. Staff-level here, with the per-area rule
  // enforced by the API, which is the only place that knows what the run is.
  {
    path: 'admin/sync/runs/:id',
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    loadComponent: () =>
      import('./sync/sync-run-page').then((m) => m.SyncRunPage),
  },
  // Filterable attributes edit in place too — a definition is four fields,
  // so there is no editor route to pair with this one.
  {
    path: 'admin/attributes',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('./catalog/attributes/attribute-list-page').then(
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
      import('./catalog/attributes/attribute-inventory-page').then(
        (m) => m.AttributeInventoryPage,
      ),
  },
  // Documents are a list and an editor route, like products and categories:
  // a file, a title and two dates are more than a row can hold, and the file
  // is uploaded from the form.
  {
    path: 'admin/documents',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('./catalog/documents/document-list-page').then(
        (m) => m.DocumentListPage,
      ),
  },
  {
    path: 'admin/documents/new',
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [
      unsavedChangesGuard((t) => t.documents.editor.discardConfirm),
    ],
    loadComponent: () =>
      import('./catalog/documents/document-editor-page').then(
        (m) => m.DocumentEditorPage,
      ),
  },
  {
    path: 'admin/documents/:id/edit',
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [
      unsavedChangesGuard((t) => t.documents.editor.discardConfirm),
    ],
    loadComponent: () =>
      import('./catalog/documents/document-editor-page').then(
        (m) => m.DocumentEditorPage,
      ),
  },
  // Tiers edit in place on one screen — two fields per tier, so no editor
  // route to pair with this one.
  {
    path: 'admin/tiers',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('./catalog/tiers/tier-list-page').then((m) => m.TierListPage),
  },
  // Machine tokens (NFR-SEC-09). Beside the tiers rather than under the sync:
  // a token is a credential the deployment issues, and the catalog import is
  // only the first thing one of them may do.
  {
    path: 'admin/api-tokens',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('./api-tokens/api-token-list-page').then(
        (m) => m.ApiTokenListPage,
      ),
  },
  // The two runtime switches — maintenance mode (FR-ADM-04) and who writes the
  // catalog (FR-ADM-10) — and the trail of changes to both.
  {
    path: 'admin/operations',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('./operations/operations-page').then((m) => m.OperationsPage),
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
      import('./users/user-list-page').then((m) => m.UserListPage),
  },
  {
    path: 'admin/users/staff',
    data: { kind: 'staff' },
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('./users/user-list-page').then((m) => m.UserListPage),
  },
  // Adding, editing and approving share one screen. The literal `staff/new`
  // stays ahead of `:id/edit` so it is never read as an account id.
  {
    path: 'admin/users/new',
    data: { kind: 'customer' },
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    canDeactivate: [unsavedChangesGuard((t) => t.users.editor.discardConfirm)],
    loadComponent: () =>
      import('./users/user-editor-page').then((m) => m.UserEditorPage),
  },
  {
    path: 'admin/users/staff/new',
    data: { kind: 'staff' },
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [unsavedChangesGuard((t) => t.users.editor.discardConfirm)],
    loadComponent: () =>
      import('./users/user-editor-page').then((m) => m.UserEditorPage),
  },
  // Reading one account, for customers and staff alike. Kept ahead of the
  // editor for no reason but reading order — the two paths cannot collide.
  // It never stands in front of `:id/edit`: the editor is reachable on its own
  // terms, owned or not.
  {
    path: 'admin/users/:id',
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    loadComponent: () =>
      import('./users/user-detail-page').then((m) => m.UserDetailPage),
  },
  {
    // Admin and manager both: which accounts a manager may open is the API's
    // call (a staff account is 404 for them), not a second list of rules here.
    path: 'admin/users/:id/edit',
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    canDeactivate: [unsavedChangesGuard((t) => t.users.editor.discardConfirm)],
    loadComponent: () =>
      import('./users/user-editor-page').then((m) => m.UserEditorPage),
  },
  // A person's consent records (NFR-LEGAL-09), found by address or number.
  // Admin only: answering for them is the operator's.
  {
    path: 'admin/consents',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('./consents/consent-lookup-page').then((m) => m.ConsentLookupPage),
  },
  // Orders, for admin and manager both (FR-AUTH-03) — a manager's daily work:
  // reading them, answering them, and writing a new version of one.
  {
    path: 'admin/orders',
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    loadComponent: () =>
      import('./orders/order-list-page').then((m) => m.AdminOrderListPage),
  },
  {
    // By reference, like the customer's own order page: it is the identity the
    // order is quoted and mailed under.
    path: 'admin/orders/:reference',
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    loadComponent: () =>
      import('./orders/order-detail-page').then((m) => m.AdminOrderDetailPage),
  },
  {
    // One version, read back (FR-ORD-03). Its own route because it is its own
    // address: a manager quoting what the shop agreed on Tuesday links at that
    // version, and the page it opens is the customer's own view of it rather
    // than the screen where the order is answered.
    path: 'admin/orders/:reference/revisions/:number',
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    loadComponent: () =>
      import('./orders/order-revision-page').then(
        (m) => m.AdminOrderRevisionPage,
      ),
  },
  {
    // Its own screen rather than a mode of the one above: an adjustment is a
    // whole new version of the order (FR-ORD-03), and a page that is sometimes
    // a form is a page whose unsaved state has nowhere to live.
    path: 'admin/orders/:reference/adjust',
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    loadComponent: () =>
      import('./orders/order-adjust-page').then((m) => m.AdminOrderAdjustPage),
  },
  {
    path: 'admin/categories',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('./catalog/categories/category-list-page').then(
        (m) => m.CategoryListPage,
      ),
  },
  // Creating and editing share one screen, like products.
  {
    path: 'admin/categories/new',
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [
      unsavedChangesGuard((t) => t.categories.editor.discardConfirm),
    ],
    loadComponent: () =>
      import('./catalog/categories/category-editor-page').then(
        (m) => m.CategoryEditorPage,
      ),
  },
  {
    path: 'admin/categories/:slug/edit',
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [
      unsavedChangesGuard((t) => t.categories.editor.discardConfirm),
    ],
    loadComponent: () =>
      import('./catalog/categories/category-editor-page').then(
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
      import('./catalog/attributes/category-filters-page').then(
        (m) => m.CategoryFiltersPage,
      ),
  },
  // The whole-catalogue listing's panel (FR-ATTR-12): the same editor with no
  // category, since nothing inherits it.
  {
    path: 'admin/catalog/filters',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('./catalog/attributes/category-filters-page').then(
        (m) => m.CategoryFiltersPage,
      ),
  },
  {
    path: 'admin/products/new',
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [
      unsavedChangesGuard((t) => t.products.editor.discardConfirm),
    ],
    loadComponent: () =>
      import('./catalog/products/product-editor-page').then(
        (m) => m.ProductEditorPage,
      ),
  },
  {
    path: 'admin/products/:slug/edit',
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [
      unsavedChangesGuard((t) => t.products.editor.discardConfirm),
    ],
    loadComponent: () =>
      import('./catalog/products/product-editor-page').then(
        (m) => m.ProductEditorPage,
      ),
  },
  // Static-page editing as an admin route, alongside the catalog editors — the
  // only way in, whether from the admin panel or the storefront pencil.
  {
    path: 'admin/pages/:slug/edit',
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [unsavedChangesGuard((t) => t.pages.discardConfirm)],
    // noReuse makes a slug change a fresh activation, so the unsaved-changes
    // guard runs and the editor re-reads its slug (see the strategy).
    data: { noReuse: true },
    loadComponent: () =>
      import('./site/pages/page-editor-page').then((m) => m.PageEditorPage),
  },
];
