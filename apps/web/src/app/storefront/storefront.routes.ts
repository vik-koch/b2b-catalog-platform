import { inject } from '@angular/core';
import { CanMatchFn, Route, UrlSegment } from '@angular/router';
import {
  CONSENT_PAGE_SLUGS,
  ConsentPurpose,
  PageSlug,
  STANDALONE_PAGE_SLUGS,
} from '@b2b-catalog-platform/shared';
import { DEPLOYMENT_CONFIG } from '../shared/config/deployment-config';
import {
  guestOnly,
  requireAuth,
  staffToAdminOrder,
} from '../shared/auth/auth.guard';
import { maintenanceGate } from './maintenance/maintenance.guard';
import { NotFoundPage } from './pages/not-found-page';
import { ContactPage } from './pages/contact-page';
import { InquiryPage } from './pages/inquiry-page';
import { MaintenanceScreen } from './pages/maintenance-screen';
import { Home } from './home/home';
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

/**
 * Gate for a consent text: it is read only where its form asks for it, so a
 * purpose switched off has no page, as an unpublished one has none.
 */
const asksConsent =
  (purpose: ConsentPurpose): CanMatchFn =>
  () =>
    inject(DEPLOYMENT_CONFIG).consent[purpose];

const isPublishedPage: CanMatchFn = (_: Route, [first]: UrlSegment[]) => {
  const slug = first?.path ?? '';
  return (
    (STANDALONE_PAGE_SLUGS as readonly string[]).includes(slug) &&
    publishes(slug as PageSlug)
  );
};

export const storefrontRoutes: Route[] = [
  { path: '', component: Home, canActivate: [maintenanceGate] },
  // Session-scoped routes, lazy so the public bundle carries none of them.
  // `layout: 'centered'` is the signed-out treatment: the shell paints a recessed
  // grey background (see app.ts) and the page draws its form in an AuthCard on top.
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
  // The customer's own area closes with the shop while maintenance is on.
  {
    path: 'account',
    canActivate: [requireAuth(), maintenanceGate],
    loadComponent: () =>
      import('./account/account-page').then((m) => m.AccountPage),
  },
  {
    path: 'account/edit',
    canActivate: [requireAuth(), maintenanceGate],
    loadComponent: () =>
      import('./account/account-edit-page').then((m) => m.AccountEditPage),
  },
  // The account's own order history (FR-ACC-01), lazy like the rest of the
  // signed-in area. The page it lands on is read-only: an order is a request,
  // and nothing about one is editable once it is sent.
  {
    path: 'account/orders',
    canActivate: [requireAuth(), staffToAdminOrder(), maintenanceGate],
    loadComponent: () =>
      import('./orders/order-list-page').then((m) => m.OrderListPage),
  },
  {
    // The reference is the identity a customer was quoted and a mail links to,
    // so it is what the URL carries — never the row's id.
    path: 'account/orders/:reference',
    canActivate: [requireAuth(), staffToAdminOrder(), maintenanceGate],
    loadComponent: () =>
      import('./orders/order-detail-page').then((m) => m.OrderDetailPage),
  },
  // `new` stays ahead of `:id/edit` so it is never read as an address id.
  {
    path: 'account/addresses/new',
    canActivate: [requireAuth(), maintenanceGate],
    loadComponent: () =>
      import('./addresses/address-editor-page').then(
        (m) => m.AddressEditorPage,
      ),
  },
  {
    path: 'account/addresses/:id/edit',
    canActivate: [requireAuth(), maintenanceGate],
    loadComponent: () =>
      import('./addresses/address-editor-page').then(
        (m) => m.AddressEditorPage,
      ),
  },
  {
    path: 'account/delete',
    canActivate: [requireAuth(), maintenanceGate],
    loadComponent: () =>
      import('./account/account-delete-page').then((m) => m.AccountDeletePage),
  },
  {
    path: 'change-password',
    canActivate: [requireAuth(), maintenanceGate],
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
  // Code routes, but their prose is a page body — so publishing governs them
  // the same way, and a deployment without the page has no dangling route.
  {
    path: 'contact',
    component: ContactPage,
    canMatch: [publishesPage('contact')],
    canActivate: [maintenanceGate],
  },
  // Lazy: read before a first order rather than on every visit, so it stays
  // out of the first load.
  {
    path: 'conditions',
    canMatch: [publishesPage('conditions')],
    canActivate: [maintenanceGate],
    loadComponent: () =>
      import('./pages/conditions-page').then((m) => m.ConditionsPage),
  },
  { path: 'inquiry', component: InquiryPage, canActivate: [maintenanceGate] },
  // The consent texts (NFR-LEGAL-09), each under the form that asks for it.
  // An ordinary page body, so the generic component renders it by its key.
  {
    path: 'inquiry/consent',
    component: StaticPage,
    data: { slug: CONSENT_PAGE_SLUGS.contact },
    canMatch: [asksConsent('contact')],
    canActivate: [maintenanceGate],
  },
  {
    path: 'register/consent',
    component: StaticPage,
    data: { slug: CONSENT_PAGE_SLUGS.account },
    canMatch: [asksConsent('account')],
    canActivate: [maintenanceGate],
  },
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
    component: CategoryGrid,
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
