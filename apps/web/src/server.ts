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
import { getAdminText, preloadAdminText } from './app/config/admin-text.server';
import { preloadDeploymentConfig } from './app/config/deployment-config.server';
import { injectShellState } from './app/config/shell-state.server';
import { isGatedPath, isMaintenanceOn } from './app/config/maintenance.server';
import {
  injectNoindexMeta,
  renderRobots,
  renderSitemap,
} from './app/config/seo.server';

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
 * robots.txt and sitemap.xml. Served from the SSR tier so they see APP_ORIGIN
 * and the per-deployment SEO_INDEXABLE flag; the sitemap pulls its URL set from
 * the API. Registered ahead of the Angular catch-all. robots.txt is always
 * answered (a crawler must be able to read it even under maintenance);
 * its body switches to disallow-all when appropriate.
 */
app.get('/robots.txt', async (_req, res, next) => {
  try {
    res.type('text/plain').send(await renderRobots());
  } catch (error) {
    next(error);
  }
});

/**
 * The admin half of the UI text (see admin-text.type.ts). Fetched by the client
 * instead of being injected into the document: the SSR tier is session-blind on
 * purpose, so it cannot vary a document by who is asking without forking the
 * page cache per visitor. Not a secret — just wording an anonymous visitor has
 * no use for — so it is served unauthenticated and cached like a static asset.
 */
app.get('/admin-text.json', (_req, res, next) => {
  try {
    res.set('Cache-Control', 'public, max-age=300').json(getAdminText());
  } catch (error) {
    next(error);
  }
});

/**
 * Third-party attribution for the code this deployment ships to browsers.
 *
 * The build produces it: `extractLicenses` (on for production configurations)
 * writes `3rdpartylicenses.txt` covering exactly the packages esbuild put into
 * the bundle. That makes the bundler the source of truth — nothing is generated
 * into the repo, nothing can go stale, and the notice can never claim a package
 * the build did not actually ship. It lands beside `browser/` rather than in
 * it, so it needs this route to be reachable; the /licenses page fetches it.
 *
 * Development builds turn extraction off, so the file is simply absent there —
 * a 404 the page renders as "not available in this build" rather than an error.
 */
const licenseNoticeFile = resolve(serverDistFolder, '../3rdpartylicenses.txt');

app.get('/licenses.txt', (_req, res, next) => {
  if (!existsSync(licenseNoticeFile)) {
    res.status(404).end();
    return;
  }
  res.set('Cache-Control', 'public, max-age=300');
  res.sendFile(licenseNoticeFile, (error) => {
    if (error) next(error);
  });
});

app.get('/sitemap.xml', async (_req, res, next) => {
  try {
    const result = await renderSitemap();
    if (result.kind === 'status') {
      res.status(result.status).end();
      return;
    }
    res.type('application/xml').send(result.body);
  } catch (error) {
    next(error);
  }
});

/**
 * Handle all other requests by rendering the Angular application.
 *
 * Every HTML document leaving here — a server-rendered page or the shell for a
 * client-rendered route — gets the per-deployment state injected, which is the
 * only channel branding and UI text have to the browser.
 */
app.use(async (req, res, next) => {
  try {
    // Maintenance gate (SSR mirror): while the storefront is gated, a public
    // route is served the maintenance screen with a 503 at its own URL — no
    // redirect, which the response could not carry alongside a 503. Point the
    // render at the maintenance route in place; the asset/static middleware
    // above has already matched the original path, so this only affects what
    // Angular renders. The engine derives the route from `originalUrl` (Express
    // sets it), so both must be rewritten or the original page renders behind
    // the 503. The server is session-blind, so an admin's cold load sees the
    // screen too; their preview happens on the subsequent client navigation.
    const gated = isGatedPath(req.path) && (await isMaintenanceOn());
    if (gated) {
      req.url = '/maintenance';
      req.originalUrl = '/maintenance';
    }

    const response = await getAngularApp().handle(req);
    if (response && gated) {
      const html = injectNoindexMeta(injectShellState(await response.text()));
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      await writeResponseToNodeResponse(
        new Response(html, { status: 503, headers }),
        res,
      );
      return;
    }
    if (!response) {
      next();
      return;
    }
    if (!response.headers.get('content-type')?.includes('text/html')) {
      await writeResponseToNodeResponse(response, res);
      return;
    }
    const html = injectNoindexMeta(injectShellState(await response.text()));
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    await writeResponseToNodeResponse(
      new Response(html, { status: response.status, headers }),
      res,
    );
  } catch (error) {
    next(error);
  }
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
  preloadAdminText();

  const port = requireEnv('WEB_PORT');
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
