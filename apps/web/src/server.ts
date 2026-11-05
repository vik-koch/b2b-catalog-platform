import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { configPath } from '@b2b-catalog-platform/shared/node';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireEnv } from './env';
import { preloadSharedText } from './app/platform/config/shared-text.server';
import { getAdminText, preloadTexts } from './app/app.texts.server';
import { preloadDeploymentConfig } from './app/platform/config/deployment-config.server';
import { injectCartShell } from './app/storefront/ordering/cart/cart-shell.server';
import { injectSessionShell } from './app/storefront/accounts/auth/session-shell.server';
import { sessionCookieIn } from './app/platform/auth/session-cookie';
import { injectShellState } from './app/app.shell-state.server';
import { injectFontHead } from './app/platform/config/font.server';
import {
  isStaffPreview,
  isGatedPath,
  isMaintenanceOn,
} from './app/storefront/site/maintenance/maintenance.server';
import {
  injectCanonicalLink,
  injectNoindexMeta,
  renderRobots,
  renderSitemap,
} from './app/storefront/shell/seo.server';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app = express();
app.disable('x-powered-by');

// SSRF protection: the engine rejects requests whose Host header is not
// allowlisted. APP_DOMAIN is the hostname Traefik routes to this stack
// (localhost during local development). Constructed lazily because the
// production build imports this module without any runtime environment.
//
// The trusted proxy headers are exactly the ones Traefik sets: it replaces
// whatever a client sent under these names, and this container is reachable
// only through it. Not `Forwarded` or `X-Forwarded-Prefix`: Traefik never sets
// them, so one arriving came from the client. Untrusted ones are dropped with
// a warning.
let angularApp: AngularNodeAppEngine | undefined;

function getAngularApp(): AngularNodeAppEngine {
  return (angularApp ??= new AngularNodeAppEngine({
    allowedHosts: [requireEnv('APP_DOMAIN')],
    trustProxyHeaders: [
      'x-forwarded-for',
      'x-forwarded-host',
      'x-forwarded-port',
      'x-forwarded-proto',
      'x-forwarded-server',
    ],
  }));
}

/**
 * Per-deployment asset overrides (logo, favicon), served ahead of the baked
 * static so a deployment can replace them from its mounted config dir. Only
 * the *assets subdir* of the mount is served, never the mount root: the JSON
 * beside it includes what only the API may read.
 */
let assetsMiddleware: express.Handler | undefined;

function getAssetsMiddleware() {
  if (!assetsMiddleware) {
    const configAssetsDir = configPath('assets');
    if (!existsSync(configAssetsDir)) {
      throw new Error(
        `The config directory has no assets/ folder: ${configAssetsDir}`,
      );
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

/** The admin half of the UI text (admin-text.type.ts), fetched rather than
 * injected, so a guest's document stays lean. No secret, so served
 * unauthenticated and cached like a static asset. */
app.get('/admin-text.json', (_req, res, next) => {
  try {
    res.set('Cache-Control', 'public, max-age=300').json(getAdminText());
  } catch (error) {
    next(error);
  }
});

/**
 * Attribution for the code shipped to browsers. `extractLicenses` (production
 * builds) writes `3rdpartylicenses.txt` for exactly what esbuild bundled, so
 * it never goes stale. It lands beside `browser/`, so it needs this route;
 * /licenses fetches it. Development builds have none: a 404 the page words as
 * "not available in this build".
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
 * Headers for a rewritten document. A render asks the API as the visitor
 * (forward-session.server.ts), so a signed-in document carries their prices
 * and account and must reach nobody else: `Vary: Cookie` on all, `private,
 * no-store` where a session shaped it, as the API does. The render marks the
 * page private itself (private-page.server.ts); this is the second line, on
 * the cookie alone.
 */
function documentHeaders(
  response: Response,
  cookieHeader: string | undefined,
): Headers {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.append('Vary', 'Cookie');
  if (sessionCookieIn(cookieHeader)) {
    headers.set('Cache-Control', 'private, no-store');
  }
  return headers;
}

/** Everything else renders the Angular app. Every document leaving here, a
 * rendered page or a client route's shell, gets the deployment state injected:
 * branding's and UI text's only way to the browser. */
app.use(async (req, res, next) => {
  try {
    // Maintenance gate (SSR mirror): while the storefront is gated, a public
    // route is served the maintenance screen with a 503 at its own URL; a
    // redirect cannot ride with a 503. Point the
    // render at the maintenance route in place; the asset/static middleware
    // above has already matched the original path, so this only affects what
    // Angular renders. The engine derives the route from `originalUrl` (Express
    // sets it), so both must be rewritten or the original page renders behind
    // the 503. Staff are recognised by the readable session hint and get the
    // storefront straight away, so previewing survives a reload; the
    // client-side gate corrects a stale hint on hydration.
    const gated =
      isGatedPath(req.path) &&
      !isStaffPreview(req.headers.cookie) &&
      (await isMaintenanceOn());
    if (gated) {
      req.url = '/maintenance';
      req.originalUrl = '/maintenance';
    }

    const response = await getAngularApp().handle(req);
    if (response && gated) {
      // No canonical here: the maintenance screen is not the content of the
      // URL it is answering, so it must not name one as its preferred form.
      const html = injectNoindexMeta(
        injectSessionShell(
          injectCartShell(
            injectFontHead(injectShellState(await response.text())),
          ),
        ),
      );
      // Retry-After matches the API's gate, and is what tells this 503 apart
      // from an outage in the error alert.
      const headers = documentHeaders(response, req.headers.cookie);
      headers.set('Retry-After', '3600');
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
    const html = injectNoindexMeta(
      injectCanonicalLink(
        injectSessionShell(
          injectCartShell(
            injectFontHead(injectShellState(await response.text())),
          ),
        ),
        req.path,
      ),
    );
    await writeResponseToNodeResponse(
      new Response(html, {
        status: response.status,
        headers: documentHeaders(response, req.headers.cookie),
      }),
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
  // first request. Only as the Node server, never in the build or prerender,
  // which import this module without a runtime environment.
  getAssetsMiddleware();
  preloadDeploymentConfig();
  preloadTexts();
  preloadSharedText();

  const port = requireEnv('WEB_PORT');
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
