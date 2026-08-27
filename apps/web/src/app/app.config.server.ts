import { HTTP_TRANSFER_CACHE_ORIGIN_MAP } from '@angular/common/http';
import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { requireEnv } from '../env';
import { appConfig } from './app.config';
import { provideServerAppText } from './config/app-text.server';
import { provideServerAdminText } from './config/admin-text.server';
import { provideServerDeploymentConfig } from './config/deployment-config.server';
import { provideServerSuggestionsEnabled } from './config/suggestions-enabled.server';
import { serverRoutes } from './app.routes.server';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // Config and copy straight from the mounted files, and the suggestion flag
    // straight from the environment. Merged after appConfig, so they win over
    // the browser providers, which read the document.
    provideServerDeploymentConfig(),
    provideServerAppText(),
    provideServerAdminText(),
    provideServerSuggestionsEnabled(),
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
