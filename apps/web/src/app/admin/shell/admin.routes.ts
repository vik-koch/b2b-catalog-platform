import { Route } from '@angular/router';
import { requireAuth } from '../../platform/auth/auth.guard';
import { inject } from '@angular/core';
import { ADMIN_TEXT, adminTextGuard } from '../../platform/config/admin-text';
import { ADMIN_SITE_TEXT } from '../../core/site/admin-site-text';
import { unsavedChangesGuard } from '../platform/unsaved-changes.guard';

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
  {
    path: 'admin/products',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('../catalog/products/product-list-page').then(
        (m) => m.ProductListPage,
      ),
  },
  // Sync (FR-ADM-02, FR-ADM-07, FR-ADM-09): a log per area, as who may read
  // each differs, with the area as route data. Explicit paths, as
  // `sync/:area` would also match `runs`. Absolute redirects: a relative one
  // resolves against the parent.
  { path: 'admin/sync', pathMatch: 'full', redirectTo: '/admin/sync/catalog' },
  { path: 'admin/sync/new', redirectTo: '/admin/sync/catalog/new' },
  {
    path: 'admin/sync/catalog',
    data: { area: 'catalog' },
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('../exchange/sync-runs-page').then((m) => m.SyncRunsPage),
  },
  {
    path: 'admin/sync/customers',
    data: { area: 'customers' },
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    loadComponent: () =>
      import('../exchange/sync-runs-page').then((m) => m.SyncRunsPage),
  },
  // A manager's too (FR-ADM-09). No `new`: orders are never uploaded.
  {
    path: 'admin/sync/orders',
    data: { area: 'orders' },
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    loadComponent: () =>
      import('../exchange/sync-runs-page').then((m) => m.SyncRunsPage),
  },
  {
    path: 'admin/sync/catalog/new',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('../exchange/catalog-sync-upload-page').then(
        (m) => m.CatalogSyncUploadPage,
      ),
  },
  // Admin-only (FR-ADM-12): creating accounts from a file is a deployment
  // act, not a manager's work.
  {
    path: 'admin/sync/customers/new',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('../exchange/customer-sync-upload-page').then(
        (m) => m.CustomerSyncUploadPage,
      ),
  },
  // One run page for every area, which it reads off the run; the API holds
  // the per-area rule.
  {
    path: 'admin/sync/runs/:id',
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    loadComponent: () =>
      import('../exchange/sync-run-page').then((m) => m.SyncRunPage),
  },
  // Edited in place: a definition is four fields.
  {
    path: 'admin/attributes',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('../catalog/attributes/attribute-list-page').then(
        (m) => m.AttributeListPage,
      ),
  },
  // Its own route: what is in the catalog, not what the shop filters by.
  {
    path: 'admin/attributes/inventory',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('../catalog/attributes/attribute-inventory-page').then(
        (m) => m.AttributeInventoryPage,
      ),
  },
  {
    path: 'admin/documents',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('../catalog/documents/document-list-page').then(
        (m) => m.DocumentListPage,
      ),
  },
  {
    path: 'admin/documents/new',
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [
      unsavedChangesGuard(
        () => inject(ADMIN_TEXT).documents.editor.discardConfirm,
      ),
    ],
    loadComponent: () =>
      import('../catalog/documents/document-editor-page').then(
        (m) => m.DocumentEditorPage,
      ),
  },
  {
    path: 'admin/documents/:id/edit',
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [
      unsavedChangesGuard(
        () => inject(ADMIN_TEXT).documents.editor.discardConfirm,
      ),
    ],
    loadComponent: () =>
      import('../catalog/documents/document-editor-page').then(
        (m) => m.DocumentEditorPage,
      ),
  },
  // Edited in place: two fields per tier.
  {
    path: 'admin/tiers',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('../catalog/tiers/tier-list-page').then((m) => m.TierListPage),
  },
  // Machine tokens (NFR-SEC-09).
  {
    path: 'admin/api-tokens',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('../exchange/api-tokens/api-token-list-page').then(
        (m) => m.ApiTokenListPage,
      ),
  },
  // Maintenance (FR-ADM-04), ownership (FR-ADM-10) and their trail.
  {
    path: 'admin/operations',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('./operations-page').then((m) => m.OperationsPage),
  },
  // One list in two views: customers for staff, staff for admins only.
  {
    path: 'admin/users',
    data: { kind: 'customer' },
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    loadComponent: () =>
      import('../accounts/users/user-list-page').then((m) => m.UserListPage),
  },
  {
    path: 'admin/users/staff',
    data: { kind: 'staff' },
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('../accounts/users/user-list-page').then((m) => m.UserListPage),
  },
  // `staff/new` ahead of `:id/edit`, so it is never read as an id.
  {
    path: 'admin/users/new',
    data: { kind: 'customer' },
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    canDeactivate: [
      unsavedChangesGuard(() => inject(ADMIN_TEXT).users.editor.discardConfirm),
    ],
    loadComponent: () =>
      import('../accounts/users/user-editor-page').then(
        (m) => m.UserEditorPage,
      ),
  },
  {
    path: 'admin/users/staff/new',
    data: { kind: 'staff' },
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [
      unsavedChangesGuard(() => inject(ADMIN_TEXT).users.editor.discardConfirm),
    ],
    loadComponent: () =>
      import('../accounts/users/user-editor-page').then(
        (m) => m.UserEditorPage,
      ),
  },
  {
    path: 'admin/users/:id',
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    loadComponent: () =>
      import('../accounts/users/user-detail-page').then(
        (m) => m.UserDetailPage,
      ),
  },
  {
    // Which accounts a manager may open is the API's call.
    path: 'admin/users/:id/edit',
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    canDeactivate: [
      unsavedChangesGuard(() => inject(ADMIN_TEXT).users.editor.discardConfirm),
    ],
    loadComponent: () =>
      import('../accounts/users/user-editor-page').then(
        (m) => m.UserEditorPage,
      ),
  },
  // Consent records (NFR-LEGAL-09), the operator's to answer for.
  {
    path: 'admin/consents',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('../accounts/consents/consent-lookup-page').then(
        (m) => m.ConsentLookupPage,
      ),
  },
  // A manager's daily work (FR-AUTH-03).
  {
    path: 'admin/orders',
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    loadComponent: () =>
      import('../ordering/order-list-page').then((m) => m.AdminOrderListPage),
  },
  {
    // By reference, the identity an order is quoted and mailed under.
    path: 'admin/orders/:reference',
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    loadComponent: () =>
      import('../ordering/order-detail-page').then(
        (m) => m.AdminOrderDetailPage,
      ),
  },
  {
    // One version (FR-ORD-03), with an address of its own to link to.
    path: 'admin/orders/:reference/revisions/:number',
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    loadComponent: () =>
      import('../ordering/order-revision-page').then(
        (m) => m.AdminOrderRevisionPage,
      ),
  },
  {
    // Its own screen: an adjustment writes a version, and its unsaved state
    // needs a page of its own.
    path: 'admin/orders/:reference/adjust',
    canActivate: [requireAuth('admin', 'manager'), adminTextGuard],
    loadComponent: () =>
      import('../ordering/order-adjust-page').then(
        (m) => m.AdminOrderAdjustPage,
      ),
  },
  {
    path: 'admin/categories',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('../catalog/categories/category-list-page').then(
        (m) => m.CategoryListPage,
      ),
  },
  {
    path: 'admin/categories/new',
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [
      unsavedChangesGuard(
        () => inject(ADMIN_TEXT).categories.editor.discardConfirm,
      ),
    ],
    loadComponent: () =>
      import('../catalog/categories/category-editor-page').then(
        (m) => m.CategoryEditorPage,
      ),
  },
  {
    path: 'admin/categories/:slug/edit',
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [
      unsavedChangesGuard(
        () => inject(ADMIN_TEXT).categories.editor.discardConfirm,
      ),
    ],
    loadComponent: () =>
      import('../catalog/categories/category-editor-page').then(
        (m) => m.CategoryEditorPage,
      ),
  },
  // The category's filter panel (FR-ATTR-11): the registry's placement, not
  // the category's fields, and reached from the storefront too.
  {
    path: 'admin/categories/:slug/filters',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('../catalog/attributes/category-filters-page').then(
        (m) => m.CategoryFiltersPage,
      ),
  },
  // The whole catalogue's panel (FR-ATTR-12): the same editor, no category.
  {
    path: 'admin/catalog/filters',
    canActivate: [requireAuth('admin'), adminTextGuard],
    loadComponent: () =>
      import('../catalog/attributes/category-filters-page').then(
        (m) => m.CategoryFiltersPage,
      ),
  },
  {
    path: 'admin/products/new',
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [
      unsavedChangesGuard(
        () => inject(ADMIN_TEXT).products.editor.discardConfirm,
      ),
    ],
    loadComponent: () =>
      import('../catalog/products/product-editor-page').then(
        (m) => m.ProductEditorPage,
      ),
  },
  {
    path: 'admin/products/:slug/edit',
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [
      unsavedChangesGuard(
        () => inject(ADMIN_TEXT).products.editor.discardConfirm,
      ),
    ],
    loadComponent: () =>
      import('../catalog/products/product-editor-page').then(
        (m) => m.ProductEditorPage,
      ),
  },
  // The only way into a page's editor, from the panel or the pencil.
  {
    path: 'admin/pages/:slug/edit',
    canActivate: [requireAuth('admin'), adminTextGuard],
    canDeactivate: [
      unsavedChangesGuard(() => inject(ADMIN_SITE_TEXT).pages.discardConfirm),
    ],
    // A slug change is a fresh activation, so the guard runs.
    data: { noReuse: true },
    loadComponent: () =>
      import('../site/pages/page-editor-page').then((m) => m.PageEditorPage),
  },
];
