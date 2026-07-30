import { Route, UrlSegment } from '@angular/router';
import { PAGE_SLUGS } from '@b2b-catalog-platform/shared';
import { guestOnly, requireAuth } from './auth/auth.guard';
import { maintenanceGate } from './admin/maintenance.guard';
import { productUnsavedChangesGuard } from './admin/product-unsaved-changes.guard';
import { categoryUnsavedChangesGuard } from './admin/category-unsaved-changes.guard';
import { NotFoundPage } from './pages/not-found-page';
import { ContactPage } from './pages/contact-page';
import { InquiryPage } from './pages/inquiry-page';
import { MaintenanceScreen } from './pages/maintenance-screen';
import { Home } from './home/home';
import { CategoryOverview } from './catalog/category-overview';
import { CategoryGrid } from './catalog/category-grid';
import { ProductDetail } from './catalog/product-detail';
import { Page } from './pages/page';
import { unsavedChangesGuard } from './pages/unsaved-changes.guard';

const isPageSlug = (_: Route, [first]: UrlSegment[]) =>
  (PAGE_SLUGS as readonly string[]).includes(first?.path ?? '');

export const appRoutes: Route[] = [
  { path: '', component: Home, canActivate: [maintenanceGate] },
  // Session-scoped routes, lazy so the public bundle carries none of them.
  {
    path: 'login',
    canActivate: [guestOnly],
    loadComponent: () => import('./auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'admin',
    canActivate: [requireAuth('admin', 'manager')],
    loadComponent: () => import('./admin/admin-page').then((m) => m.AdminPage),
  },
  // Product management, admin-only and client-rendered like the panel.
  {
    path: 'admin/products',
    canActivate: [requireAuth('admin')],
    loadComponent: () =>
      import('./admin/admin-product-list-page').then(
        (m) => m.AdminProductListPage,
      ),
  },
  {
    path: 'admin/categories',
    canActivate: [requireAuth('admin')],
    loadComponent: () =>
      import('./admin/admin-category-list-page').then(
        (m) => m.AdminCategoryListPage,
      ),
  },
  {
    path: 'admin/categories/:slug/edit',
    canActivate: [requireAuth('admin')],
    canDeactivate: [categoryUnsavedChangesGuard],
    loadComponent: () =>
      import('./admin/admin-category-editor-page').then(
        (m) => m.AdminCategoryEditorPage,
      ),
  },
  {
    path: 'admin/products/new',
    canActivate: [requireAuth('admin')],
    canDeactivate: [productUnsavedChangesGuard],
    loadComponent: () =>
      import('./admin/product-editor-page').then((m) => m.ProductEditorPage),
  },
  {
    path: 'admin/products/:slug/edit',
    canActivate: [requireAuth('admin')],
    canDeactivate: [productUnsavedChangesGuard],
    loadComponent: () =>
      import('./admin/product-editor-page').then((m) => m.ProductEditorPage),
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
  { path: 'contact', component: ContactPage, canActivate: [maintenanceGate] },
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
    component: Page,
    canMatch: [isPageSlug],
    canActivate: [maintenanceGate],
    // noReuse makes a slug change a fresh activation, so the unsaved-changes
    // guard runs when an admin edits and switches pages (see the strategy).
    canDeactivate: [unsavedChangesGuard],
    data: { noReuse: true },
  },
  { path: '**', component: NotFoundPage },
];
