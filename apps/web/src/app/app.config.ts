import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideRouter,
  RouteReuseStrategy,
  withComponentInputBinding,
} from '@angular/router';
import { appRoutes } from './app.routes';
import { StaticPageReuseStrategy } from './pages/unsaved-changes.guard';
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
    provideRouter(appRoutes, withComponentInputBinding()),
    { provide: RouteReuseStrategy, useClass: StaticPageReuseStrategy },
    // Browser reads config + copy from the script the Node process injects into
    // every document (shell-state.ts); the server providers
    // (app.config.server.ts) are merged last and override these on SSR.
    provideDeploymentConfig(),
    provideAppText(),
  ],
};
