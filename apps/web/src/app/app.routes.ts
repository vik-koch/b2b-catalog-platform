import { Route, UrlSegment } from '@angular/router';
import { PAGE_SLUGS } from '@b2b-catalog-platform/shared';
import { guestOnly, requireAuth } from './auth/auth.guard';
import { NotFoundPage } from './pages/not-found-page';
import { ContactPage } from './pages/contact-page';
import { InquiryPage } from './pages/inquiry-page';
import { Home } from './home/home';
import { Page } from './pages/page';
import { unsavedChangesGuard } from './pages/unsaved-changes.guard';

const isPageSlug = (_: Route, [first]: UrlSegment[]) =>
  (PAGE_SLUGS as readonly string[]).includes(first?.path ?? '');

export const appRoutes: Route[] = [
  { path: '', component: Home },
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
  // Code pages are declared before the generic :slug route.
  { path: 'contact', component: ContactPage },
  { path: 'inquiry', component: InquiryPage },
  {
    path: ':slug',
    component: Page,
    canMatch: [isPageSlug],
    // noReuse makes a slug change a fresh activation, so the unsaved-changes
    // guard runs when an admin edits and switches pages (see the strategy).
    canDeactivate: [unsavedChangesGuard],
    data: { noReuse: true },
  },
  { path: '**', component: NotFoundPage },
];
