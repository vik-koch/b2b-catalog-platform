import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideRouter,
  RouteReuseStrategy,
  withComponentInputBinding,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';
import { appRoutes } from './app.routes';
import { StaticPageReuseStrategy } from './core/unsaved-changes.guard';
import {
  provideClientHydration,
  withEventReplay,
} from '@angular/platform-browser';
import { provideAppText } from './config/app-text';
import { provideDeploymentConfig } from './config/deployment-config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideClientHydration(withEventReplay()),
    provideBrowserGlobalErrorListeners(),
    // View transitions let the browser cross-fade the outgoing and incoming
    // pages natively, which is most of what makes a client-side navigation feel
    // less abrupt. Browsers without the API simply swap as before, so this is
    // additive — there is no fallback to write.
    provideRouter(
      appRoutes,
      withComponentInputBinding(),
      withViewTransitions({ skipInitialTransition: true }),
      // Every navigation starts at the top — paging through a grid otherwise
      // leaves the visitor halfway down the next page. `top` rather than
      // `enabled` on purpose: the pages here are lists whose content changes
      // under the same route, so a restored offset points at nothing.
      withInMemoryScrolling({
        scrollPositionRestoration: 'top',
        anchorScrolling: 'enabled',
      }),
    ),
    { provide: RouteReuseStrategy, useClass: StaticPageReuseStrategy },
    // Browser reads config + copy from the script the Node process injects into
    // every document (shell-state.ts); the server providers
    // (app.config.server.ts) are merged last and override these on SSR.
    provideDeploymentConfig(),
    provideAppText(),
  ],
};
