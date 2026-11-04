import { isPlatformBrowser } from '@angular/common';
import {
  ApplicationConfig,
  ErrorHandler,
  provideBrowserGlobalErrorListeners,
  provideEnvironmentInitializer,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import {
  provideRouter,
  RouteReuseStrategy,
  withComponentInputBinding,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';
import { provideEditModeCatalog } from './admin/catalog/edit-mode-catalog';
import { appRoutes } from './app.routes';
import { BenignErrorFilter } from './platform/benign-errors';
import { provideHydration } from './platform/hydration';
import { StaticPageReuseStrategy } from './platform/route-reuse';
import { ScrollRestoration } from './platform/scroll-restoration';
import { CartRepricing } from './storefront/ordering/cart/cart-repricing';
import { provideStorefrontText } from './platform/config/storefront-text';
import {
  provideSharedText,
  provideUiText,
} from './platform/config/shared-text';
import { provideGridText } from './admin/provide-grid-text';
import { provideDeploymentConfig } from './platform/config/deployment-config';
import { provideSuggestionsEnabled } from './platform/config/suggestions-enabled';
import { provideDigitMaskFormat } from './platform/contact-fields';
import { ProductCart } from './core/catalog/buying/product-cart';
import { WorkRefresh } from './platform/work-refresh';
import { WorkService } from './core/work/work.service';
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
    // less abrupt. Browsers without the API simply swap as before, so this is
    // additive — there is no fallback to write.
    provideRouter(
      appRoutes,
      withComponentInputBinding(),
      withViewTransitions({ skipInitialTransition: true }),
      // A new navigation starts at the top — paging through a grid otherwise
      // leaves the visitor halfway down the next page. Back and forward return
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
    // cart lives in storage the server cannot read, so there is nothing for it
    // to do during a render — and constructing it there would pull the auth
    // and pricing clients into every place the app is merely *booted*, the
    // build's route extraction included.
    provideEnvironmentInitializer(() => {
      if (isPlatformBrowser(inject(PLATFORM_ID))) inject(CartRepricing);
    }),
    provideEnvironmentInitializer(() => {
      if (isPlatformBrowser(inject(PLATFORM_ID))) inject(ScrollRestoration);
    }),
  ],
};
