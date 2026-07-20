import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { appRoutes } from './app.routes';
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
    // Browser reads config + copy from TransferState; the server providers
    // (app.config.server.ts) are merged last and override these on SSR.
    provideDeploymentConfig(),
    provideAppText(),
  ],
};
