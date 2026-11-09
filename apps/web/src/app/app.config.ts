import { isPlatformBrowser } from '@angular/common';
import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  PLATFORM_ID,
  provideBrowserGlobalErrorListeners,
  provideEnvironmentInitializer,
} from '@angular/core';
import {
  provideRouter,
  RouteReuseStrategy,
  withComponentInputBinding,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';

import { provideEditModeCatalog } from './admin/catalog/edit-mode-catalog';
import { provideGridText } from './admin/platform/provide-grid-text';
import { appRoutes } from './app.routes';
import { ProductCart } from './core/catalog/buying/product-cart';
import { WorkService } from './core/work/work.service';
import { BenignErrorFilter } from './platform/benign-errors';
import { provideDeploymentConfig } from './platform/config/deployment-config';
import {
  provideSharedText,
  provideUiText,
} from './platform/config/shared-text';
import { provideStorefrontText } from './platform/config/storefront-text';
import { provideSuggestionsEnabled } from './platform/config/suggestions-enabled';
import { provideDigitMaskFormat } from './platform/contact-fields';
import { provideHydration } from './platform/hydration';
import { skipInPageTransitions } from './platform/in-page-transitions';
import { StaticPageReuseStrategy } from './platform/route-reuse';
import { ScrollRestoration } from './platform/scroll-restoration';
import { WorkRefresh } from './platform/work-refresh';
import { CartRepricing } from './storefront/ordering/cart/cart-repricing';
import { CartService } from './storefront/ordering/cart/cart.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHydration(),
    provideBrowserGlobalErrorListeners(),
    // The listeners above forward every window error to the ErrorHandler,
    // including one the browser raises by design; see BenignErrorFilter.
    { provide: ErrorHandler, useClass: BenignErrorFilter },
    // View transitions let the browser cross-fade the outgoing and incoming
    // pages natively, which is most of what makes a client-side navigation feel
    // less abrupt. Browsers without the API just swap pages, so there is no
    // fallback to write. Only between pages: see skipInPageTransitions.
    provideRouter(
      appRoutes,
      withComponentInputBinding(),
      withViewTransitions({
        skipInitialTransition: true,
        onViewTransitionCreated: skipInPageTransitions,
      }),
      // A new navigation starts at the top, or paging a grid leaves the
      // visitor halfway down. Back and forward return
      // to where the visitor was; the URL carries the page, sort and filters,
      // so the listing it returns to is the one they left. The router restores
      // before a listing has loaded, so ScrollRestoration repeats it after.
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
    ),
    { provide: RouteReuseStrategy, useClass: StaticPageReuseStrategy },
    // Browser reads config + copy from the script the Node process injects into
    // every document (shell-state.ts); the server providers
    // (app.config.server.ts) are merged last and override these on SSR.
    provideDeploymentConfig(),
    provideStorefrontText(),
    provideSharedText(),
    provideUiText(),
    provideGridText(),
    provideSuggestionsEnabled(),
    provideDigitMaskFormat(),
    provideEditModeCatalog(),
    // Ports for what an area may not import: the buying controls reach the
    // cart, and the screens that clear work reach the marker.
    { provide: ProductCart, useExisting: CartService },
    { provide: WorkRefresh, useExisting: WorkService },
    // Nothing injects it, and it has to run wherever the visitor happens to
    // be: a cart priced for somebody else is corrected as the session changes,
    // not when the cart page is next opened.
    //
    // Browser-only at the initializer rather than only inside the service: a
    // cart lives in storage the server cannot read, and constructing it there
    // would pull the auth and pricing clients into every boot, the build's
    // route extraction included.
    provideEnvironmentInitializer(() => {
      if (isPlatformBrowser(inject(PLATFORM_ID))) inject(CartRepricing);
    }),
    provideEnvironmentInitializer(() => {
      if (isPlatformBrowser(inject(PLATFORM_ID))) inject(ScrollRestoration);
    }),
  ],
};
