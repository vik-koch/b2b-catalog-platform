import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireEnv } from './env';
import { preloadAppText } from './app/config/app-text.server';
import { preloadDeploymentConfig } from './app/config/deployment-config.server';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app = express();

// SSRF protection: the engine rejects requests whose Host header is not
// allowlisted. APP_DOMAIN is the hostname Traefik routes to this stack
// (localhost during local development). Constructed lazily because the
// production build imports this module without any runtime environment.
let angularApp: AngularNodeAppEngine | undefined;

function getAngularApp(): AngularNodeAppEngine {
  return (angularApp ??= new AngularNodeAppEngine({
    allowedHosts: [requireEnv('APP_DOMAIN')],
  }));
}

/**
 * Per-deployment asset overrides (logo, favicon), served ahead of the baked
 * static so a deployment can replace them from its mounted config dir.
 * CONFIG_ASSETS_DIR points at the *assets subdir* of the config mount, never
 * the mount root: only files placed under it are web-served!
 */
let assetsMiddleware: express.Handler | undefined;

function getAssetsMiddleware() {
  if (!assetsMiddleware) {
    const configAssetsDir = process.env['CONFIG_ASSETS_DIR'];
    if (!configAssetsDir) {
      throw new Error(
        `CONFIG_ASSETS_DIR is not set — it must name a mounted config folder (see config/README.md)`,
      );
    }
    if (!existsSync(configAssetsDir)) {
      throw new Error(`Folder under CONFIG_ASSETS_DIR does not exist!`);
    }
    assetsMiddleware = express.static(configAssetsDir, {
      maxAge: '1y',
      index: false,
      redirect: false,
    });
  }
  return assetsMiddleware;
}

/**
 * Per-deployment asset overrides (logo, favicon). The middleware is memoized on
 * first use; the Node entry point below warms it (and the config loaders) at
 * startup so a misconfigured mount fails the boot rather than the first request.
 */
app.use((req, res, next) => {
  getAssetsMiddleware()(req, res, next);
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use('/**', (req, res, next) => {
  getAngularApp()
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `WEB_PORT` environment variable.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  // Validate the whole per-deployment config mount before listening, so a
  // missing/invalid file or assets dir fails the boot rather than 500ing on the
  // first request. Only runs when started as the Node server — never during the
  // build/prerender, which import this module without a runtime environment.
  getAssetsMiddleware();
  preloadDeploymentConfig();
  preloadAppText();

  const port = requireEnv('WEB_PORT');
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
