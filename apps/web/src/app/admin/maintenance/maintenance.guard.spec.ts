import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { AuthUser } from '@b2b-catalog-platform/shared';
import { AuthService } from '../../auth/auth.service';
import { adminUser as admin, plainUser } from '../../auth/auth-user.fixture';
import { maintenanceGate } from './maintenance.guard';
import { MaintenanceService } from './maintenance.service';

function setup(
  enabled: boolean,
  user: AuthUser | null,
  // The pre-hydration state the gate short-circuits on: a readable hint while
  // /auth/me has not answered yet. Resolved by default, as it is once the app
  // has settled and every in-app navigation runs.
  session: { resolved?: boolean; hintedRole?: string | null } = {},
) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      // The gate is browser-only; these assertions cover that path.
      { provide: PLATFORM_ID, useValue: 'browser' },
      {
        provide: MaintenanceService,
        useValue: { isEnabled: () => Promise.resolve(enabled) },
      },
      {
        provide: AuthService,
        useValue: {
          user: signal(user),
          resolved: signal(session.resolved ?? true),
          hintedRole: signal(session.hintedRole ?? null),
          whenResolved: () => Promise.resolve(),
        },
      },
    ],
  });
  return TestBed.inject(Router);
}

async function run(router: Router): Promise<true | string> {
  const result = await TestBed.runInInjectionContext(() =>
    maintenanceGate(
      {} as ActivatedRouteSnapshot,
      {
        url: '/catalog',
      } as RouterStateSnapshot,
    ),
  );
  return result instanceof UrlTree
    ? router.serializeUrl(result)
    : (result as true);
}

describe('maintenanceGate', () => {
  it('lets everyone through when maintenance is off', async () => {
    const router = setup(false, null);

    expect(await run(router)).toBe(true);
  });

  it('sends a visitor to the maintenance screen when it is on', async () => {
    const router = setup(true, null);

    expect(await run(router)).toBe('/maintenance');
  });

  it('lets an admin through to preview while it is on', async () => {
    const router = setup(true, admin);

    expect(await run(router)).toBe(true);
  });

  it('trusts an admin hint before the session resolves', async () => {
    const router = setup(true, null, { resolved: false, hintedRole: 'admin' });

    expect(await run(router)).toBe(true);
  });

  it('ignores a stale admin hint once the session says otherwise', async () => {
    const router = setup(true, null, { resolved: true, hintedRole: 'admin' });

    expect(await run(router)).toBe('/maintenance');
  });

  it('still hides the shop from a signed-in non-admin', async () => {
    const router = setup(true, plainUser);

    expect(await run(router)).toBe('/maintenance');
  });
});
