import 'reflect-metadata';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RequestMethod, Type } from '@nestjs/common';
import {
  CONTROLLER_WATERMARK,
  GUARDS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../app/app.module';
import { MachineScope } from '../api-tokens/machine-scope.decorator';
import { MachineTokenGuard } from '../api-tokens/machine-token.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Roles } from './roles.decorator';

/**
 * Who can reach every route the API mounts (NFR-SEC-04).
 *
 * Authentication is opt-in per route — `@Auth(...)` or `@Machine(...)` — so a
 * route that forgets it is open to anyone. This table is the other half: a new
 * route, or a change in who reaches one, fails here until the table says so,
 * and the change shows up in review. A public route states why it is public.
 *
 * Access is read the way the guards decide it at runtime: `public`,
 * `signed-in` (any account), the roles allowed (`admin+manager`), or
 * `machine:<scope>`. Ownership — whose order, whose address — is the
 * handler's job and is not visible here.
 */
const pub = (why: string) => {
  if (!why.trim()) throw new Error('a public route says why it is public');
  return 'public';
};

const EXPECTED: Record<string, string> = {
  // Session
  'POST /api/auth/login': pub('signing in'),
  'POST /api/auth/logout': pub('clears the cookie; harmless without one'),
  'POST /api/auth/register': pub('self-registration, approved by staff'),
  'POST /api/auth/forgot-password': pub('asks for a reset link by address'),
  'GET /api/auth/password-token/:token': pub('the token is the credential'),
  'POST /api/auth/set-password': pub('the token is the credential'),
  'POST /api/auth/sign-in-step/code': pub('second step of a pending sign-in'),
  'POST /api/auth/sign-in-step/call': pub('second step of a pending sign-in'),
  'POST /api/auth/sign-in-step/resend': pub('second step of a pending sign-in'),
  'GET /api/auth/sign-in-step/stand-in/:reference': pub(
    'mailed stand-in for the call; absent with a real provider',
  ),
  'GET /api/auth/me': 'signed-in',
  'POST /api/auth/change-password': 'signed-in',

  // Storefront
  'GET /api/catalog/categories': pub('storefront'),
  'GET /api/catalog/categories/:slug/products': pub('storefront'),
  'GET /api/catalog/featured': pub('storefront'),
  'GET /api/catalog/products': pub('storefront'),
  'GET /api/catalog/products/:slug': pub('storefront'),
  'GET /api/catalog/products/:slug/pairings': pub('storefront'),
  'GET /api/catalog/search': pub('storefront'),
  'GET /api/catalog/search/suggestions': pub('storefront'),
  'GET /api/catalog/sitemap': pub('crawlers'),
  'GET /api/pages/:slug': pub('static pages'),
  'GET /api/maintenance': pub('the gate itself; read by SSR and deploys'),
  'POST /api/inquiry': pub('contact form'),
  'GET /api/addresses/suggestions': pub('checkout and registration forms'),
  'GET /api/companies/suggestions': pub('checkout and registration forms'),

  // Cart and orders
  'POST /api/cart/preview': pub('guests price a cart too'),
  'POST /api/orders': pub('guest checkout'),
  'GET /api/orders/by-token/:token': pub('mailed order link; token-bearing'),
  'GET /api/order-documents/by-token/:token/:kind': pub(
    'mailed order link; token-bearing',
  ),
  'GET /api/order-documents/:reference/:kind': 'signed-in',
  'POST /api/order-documents/:reference/:kind': 'admin+manager',
  'DELETE /api/order-documents/:reference/:kind': 'admin+manager',
  'POST /api/order-documents/:reference/:kind/notify': 'admin+manager',

  // Account
  'GET /api/account/profile': 'signed-in',
  'PATCH /api/account/profile': 'signed-in',
  'POST /api/account/delete': 'signed-in',
  'GET /api/account/addresses': 'signed-in',
  'POST /api/account/addresses': 'signed-in',
  'PUT /api/account/addresses/:id': 'signed-in',
  'DELETE /api/account/addresses/:id': 'signed-in',
  'GET /api/account/orders': 'signed-in',
  'GET /api/account/orders/:reference': 'signed-in',
  'POST /api/account/orders/:reference/cancel': 'signed-in',
  'GET /api/work/counts': 'signed-in',

  // Admin: catalog
  'GET /api/admin/catalog/categories': 'admin',
  'POST /api/admin/catalog/categories': 'admin',
  'PATCH /api/admin/catalog/categories/order': 'admin',
  'PUT /api/admin/catalog/categories/:id': 'admin',
  'DELETE /api/admin/catalog/categories/:id': 'admin',
  'GET /api/admin/catalog/categories/:slug/hidden-products': 'admin',
  'GET /api/admin/catalog/products': 'admin',
  'POST /api/admin/catalog/products': 'admin',
  'GET /api/admin/catalog/products/:slug': 'admin',
  'PUT /api/admin/catalog/products/:slug': 'admin',
  'DELETE /api/admin/catalog/products/:slug': 'admin',
  'DELETE /api/admin/catalog/products/:slug/permanent': 'admin',
  'GET /api/admin/catalog/products/:slug/page': 'admin',
  'PATCH /api/admin/catalog/products/:slug/published': 'admin',
  'POST /api/admin/catalog/products/:slug/restore': 'admin',
  'GET /api/admin/catalog/products/:slug/stranded-pairings': 'admin',
  'GET /api/admin/catalog/filters': 'admin',
  'PUT /api/admin/catalog/filters': 'admin',
  'GET /api/admin/categories/:slug/filters': 'admin',
  'PUT /api/admin/categories/:slug/filters': 'admin',
  'DELETE /api/admin/categories/:slug/filters': 'admin',
  'GET /api/admin/attributes': 'admin',
  'POST /api/admin/attributes': 'admin',
  'PATCH /api/admin/attributes/order': 'admin',
  'PUT /api/admin/attributes/:id': 'admin',
  'DELETE /api/admin/attributes/:id': 'admin',
  'GET /api/admin/attributes/inventory': 'admin',
  'GET /api/admin/attributes/inventory/values': 'admin',
  'POST /api/admin/attributes/inventory/rename-key': 'admin',
  'POST /api/admin/attributes/inventory/rename-value': 'admin',
  'GET /api/admin/documents': 'admin',
  'POST /api/admin/documents': 'admin',
  'GET /api/admin/documents/:id': 'admin',
  'PUT /api/admin/documents/:id': 'admin',
  'DELETE /api/admin/documents/:id': 'admin',
  'POST /api/media': 'admin',
  'POST /api/media/catalog': 'admin',
  'POST /api/media/catalog/square': 'admin',
  'POST /api/media/document': 'admin',
  'GET /api/pages/:slug/versions': 'admin',
  'PUT /api/pages/:slug': 'admin',

  // Admin: pricing
  'GET /api/admin/tiers': 'admin+manager',
  'POST /api/admin/tiers': 'admin',
  'PATCH /api/admin/tiers/order': 'admin',
  'PUT /api/admin/tiers/:id': 'admin',
  'PUT /api/admin/tiers/:id/default': 'admin',
  'DELETE /api/admin/tiers/:id': 'admin',

  // Admin: orders
  'GET /api/admin/orders': 'admin+manager',
  'GET /api/admin/orders/:reference': 'admin+manager',
  'GET /api/admin/orders/:reference/revisions': 'admin+manager',
  'GET /api/admin/orders/:reference/revisions/:number': 'admin+manager',
  'POST /api/admin/orders/:reference/adjustment': 'admin+manager',
  'POST /api/admin/orders/:reference/adjustment/preview': 'admin+manager',
  'POST /api/admin/orders/:reference/notify': 'admin+manager',
  'POST /api/admin/orders/:reference/payment': 'admin+manager',
  'POST /api/admin/orders/:reference/status': 'admin+manager',
  'DELETE /api/admin/orders/:reference/personal-data': 'admin',

  // Admin: people
  'GET /api/admin/users': 'admin+manager',
  'POST /api/admin/users': 'admin+manager',
  'GET /api/admin/users/:id': 'admin+manager',
  'PATCH /api/admin/users/:id': 'admin+manager',
  'DELETE /api/admin/users/:id': 'admin+manager',
  'PATCH /api/admin/users/:id/active': 'admin+manager',
  'POST /api/admin/users/:id/approve': 'admin+manager',
  'POST /api/admin/users/:id/password-link': 'admin+manager',
  'POST /api/admin/users/:id/deletion': 'admin',
  'GET /api/admin/users/:id/consents': 'admin',
  'PUT /api/admin/users/:id/sign-in-step-exemption': 'admin',
  'GET /api/admin/consents': 'admin',
  'POST /api/admin/consents/:id/withdrawal': 'admin',

  // Admin: sync, tokens, settings
  'POST /api/admin/sync/preview': 'admin',
  'POST /api/admin/sync/customers/preview': 'admin',
  'GET /api/admin/sync/runs': 'admin+manager',
  'GET /api/admin/sync/runs/:id': 'admin+manager',
  'POST /api/admin/sync/runs/:id/commit': 'admin+manager',
  'POST /api/admin/sync/runs/:id/discard': 'admin+manager',
  'GET /api/admin/api-tokens': 'admin',
  'POST /api/admin/api-tokens': 'admin',
  'POST /api/admin/api-tokens/:id/revoke': 'admin',
  'GET /api/settings': 'admin',
  'GET /api/settings/changes': 'admin',
  'GET /api/settings/build-info': 'admin+manager',
  'PUT /api/settings/maintenance': 'admin',
  'PUT /api/settings/ownership': 'admin',

  // Machine
  'GET /api/machine/token': 'machine:catalog-sync',
  'POST /api/machine/sync/runs': 'machine:catalog-sync',
  'GET /api/machine/sync/runs/:id': 'machine:catalog-sync',
  'POST /api/machine/sync/failures': 'machine:catalog-sync',
  'GET /api/machine/customers/accounts': 'machine:customer-read',
  'POST /api/machine/sync/customers/runs': 'machine:customer-sync',
  'GET /api/machine/sync/customers/runs/:id': 'machine:customer-sync',
  'POST /api/machine/sync/customers/failures': 'machine:customer-sync',
  'GET /api/machine/orders': 'machine:order-read',
  'GET /api/machine/orders/:reference': 'machine:order-read',
  'POST /api/machine/sync/orders/runs': 'machine:order-sync',
  'GET /api/machine/sync/orders/runs/:id': 'machine:order-sync',
  'POST /api/machine/sync/orders/failures': 'machine:order-sync',
  'POST /api/machine/orders/:reference/documents/:kind': 'machine:order-sync',
  'DELETE /api/machine/orders/:reference/documents/:kind':
    'machine:order-sync',
};

const reflector = new Reflector();

interface Route {
  key: string;
  controller: Type;
  handler: Type;
}

/** Every controller reachable from the root module's import tree. */
function mountedControllers(root: Type): Set<Type> {
  const seen = new Set<unknown>();
  const controllers = new Set<Type>();
  const visit = (entry: unknown) => {
    if (!entry || seen.has(entry)) return;
    seen.add(entry);
    const forwarded = (entry as { forwardRef?: () => unknown }).forwardRef;
    if (forwarded) return visit(forwarded());
    // A dynamic module ({ module, imports, controllers }) adds to its class's.
    const dynamic = entry as {
      module?: Type;
      imports?: unknown[];
      controllers?: Type[];
    };
    const module = dynamic.module ?? (entry as Type);
    const extra = dynamic.module ? dynamic : {};
    for (const controller of [
      ...(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, module) ?? []),
      ...(extra.controllers ?? []),
    ]) {
      controllers.add(controller);
    }
    [
      ...(Reflect.getMetadata(MODULE_METADATA.IMPORTS, module) ?? []),
      ...(extra.imports ?? []),
    ].forEach(visit);
  };
  visit(root);
  return controllers;
}

function joinPath(...parts: string[]): string {
  return (
    '/' +
    parts
      .flatMap((part) => part.split('/'))
      .filter(Boolean)
      .join('/')
  );
}

function routes(): Route[] {
  const found: Route[] = [];
  for (const controller of mountedControllers(AppModule)) {
    const bases = [Reflect.getMetadata(PATH_METADATA, controller) ?? ''].flat();
    const proto = controller.prototype;
    for (const name of Object.getOwnPropertyNames(proto)) {
      const handler = proto[name];
      if (name === 'constructor' || typeof handler !== 'function') continue;
      const path = Reflect.getMetadata(PATH_METADATA, handler);
      if (path === undefined) continue;
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler)];
      for (const base of bases) {
        for (const sub of [path].flat()) {
          found.push({
            key: `${method} ${joinPath('api', base, sub)}`,
            controller,
            handler,
          });
        }
      }
    }
  }
  return found;
}

function accessOf({ controller, handler }: Route): string {
  const guards: unknown[] = [
    ...(Reflect.getMetadata(GUARDS_METADATA, controller) ?? []),
    ...(Reflect.getMetadata(GUARDS_METADATA, handler) ?? []),
  ];
  const targets = [handler, controller];
  const session = guards.includes(JwtAuthGuard);
  const machine = guards.includes(MachineTokenGuard);
  if (session && machine) return 'session+machine';
  if (machine) {
    return `machine:${reflector.getAllAndOverride(MachineScope, targets)}`;
  }
  if (session) {
    const roles = reflector.getAllAndOverride(Roles, targets);
    return roles?.length ? [...roles].sort().join('+') : 'signed-in';
  }
  return 'public';
}

/** Every class decorated with @Controller in a *.controller.ts file. */
async function declaredControllers(): Promise<Set<Type>> {
  const root = join(__dirname, '..');
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter(
    (file) => file.endsWith('.controller.ts'),
  );
  const controllers = new Set<Type>();
  for (const file of files) {
    const module: Record<string, unknown> = await import(join(root, file));
    for (const value of Object.values(module)) {
      if (
        typeof value === 'function' &&
        Reflect.getMetadata(CONTROLLER_WATERMARK, value)
      ) {
        controllers.add(value as Type);
      }
    }
  }
  return controllers;
}

describe('route access', () => {
  const all = routes();

  it('matches the table for every mounted route', () => {
    const actual = Object.fromEntries(all.map((r) => [r.key, accessOf(r)]));
    expect(actual).toEqual(EXPECTED);
  });

  it('sees every declared controller', async () => {
    const mounted = mountedControllers(AppModule);
    const missing = [...(await declaredControllers())]
      .filter((controller) => !mounted.has(controller))
      .map((controller) => controller.name);
    expect(missing).toEqual([]);
  });

  // RolesGuard lets a method's roles replace its class's, and an empty list
  // means any account — so a bare @Auth() on a method inside an
  // @Auth('admin') class would open it to customers. Naming roles of its own
  // is allowed (the sync runs add managers on purpose); the table shows that.
  it('never lets a bare method @Auth() drop its class roles', () => {
    const opened = all
      .filter(({ controller, handler }) => {
        const outer = reflector.get(Roles, controller);
        const inner = reflector.get(Roles, handler);
        return !!outer?.length && inner !== undefined && !inner.length;
      })
      .map((r) => r.key);
    expect(opened).toEqual([]);
  });
});
