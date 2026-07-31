import { inject } from '@angular/core';
import { CanMatchFn, Route, UrlSegment } from '@angular/router';
import { PageSlug, STANDALONE_PAGE_SLUGS } from '@b2b-catalog-platform/shared';
import { DEPLOYMENT_CONFIG } from './config/deployment-config';
import { guestOnly, requireAuth } from './auth/auth.guard';
import { adminTextGuard } from './config/admin-text';
import { maintenanceGate } from './admin/maintenance/maintenance.guard';
import { productUnsavedChangesGuard } from './admin/products/unsaved-changes.guard';
import { categoryUnsavedChangesGuard } from './admin/categories/unsaved-changes.guard';
import { NotFoundPage } from './pages/not-found-page';
import { ContactPage } from './pages/contact-page';
import { InquiryPage } from './pages/inquiry-page';
import { MaintenanceScreen } from './pages/maintenance-screen';
import { Home } from './home/home';
import { CategoryOverview } from './catalog/category-overview';
import { CategoryGrid } from './catalog/category-grid';
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
  {
    path: 'login',
    canActivate: [guestOnly],
    loadComponent: () => import('./auth/login-page').then((m) => m.LoginPage),
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
