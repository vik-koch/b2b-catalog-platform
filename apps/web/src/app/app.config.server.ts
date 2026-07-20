import { HTTP_TRANSFER_CACHE_ORIGIN_MAP } from '@angular/common/http';
import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { requireEnv } from '../env';
import { appConfig } from './app.config';
import { provideServerAppText } from './config/app-text.server';
import { provideServerDeploymentConfig } from './config/deployment-config.server';
import { serverRoutes } from './app.routes.server';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // Derive config (demo defaults + env flags) and copy, and write them into
    // TransferState. Merged after appConfig, so they win over the browser
    // providers during SSR.
    provideServerDeploymentConfig(),
    provideServerAppText(),
    // SSR fetches the API via the internal API_URL origin; the browser via
    // the public origin (APP_ORIGIN). Mapping the former to the latter makes
    // the hydration transfer cache keys match, so GET responses rendered on
    // the server are replayed from the HTML instead of refetched.
    // useFactory keeps the env read lazy — this module is imported at build
    // time, where no runtime environment exists.
    {
      provide: HTTP_TRANSFER_CACHE_ORIGIN_MAP,
      useFactory: () => ({
        [new URL(requireEnv('API_URL')).origin]: requireEnv('APP_ORIGIN'),
      }),
    },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
