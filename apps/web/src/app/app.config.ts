import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideRouter,
  RouteReuseStrategy,
  withComponentInputBinding,
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
    ),
    { provide: RouteReuseStrategy, useClass: StaticPageReuseStrategy },
    // Browser reads config + copy from the script the Node process injects into
    // every document (shell-state.ts); the server providers
    // (app.config.server.ts) are merged last and override these on SSR.
    provideDeploymentConfig(),
    provideAppText(),
  ],
};
