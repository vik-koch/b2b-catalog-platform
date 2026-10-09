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
import { ROUTE_ACCESS } from '@b2b-catalog-platform/shared/node';
import { AppModule } from '../app/app.module';
import { MachineScope } from '../api-tokens/machine-scope.decorator';
import { MachineTokenGuard } from '../api-tokens/machine-token.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Roles } from './roles.decorator';

/**
 * Reads every mounted route's access off the guard metadata and holds it to
 * ROUTE_ACCESS. The api-e2e role sweep holds the running API to the same table.
 */
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
    expect(actual).toEqual(ROUTE_ACCESS);
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
