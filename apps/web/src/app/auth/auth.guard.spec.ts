import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { AuthUser } from '@b2b-catalog-platform/shared';
import { AuthService } from './auth.service';
import { guestOnly, requireAuth } from './auth.guard';
import { adminUser as admin, plainUser } from './auth-user.fixture';

function setup(user: AuthUser | null) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthService,
        useValue: { user: signal(user), whenResolved: () => Promise.resolve() },
      },
    ],
  });
  return TestBed.inject(Router);
}

/** Guards resolve to `true` or a UrlTree; render the latter for comparison. */
async function run(
  guard: ReturnType<typeof requireAuth>,
  url: string,
  router: Router,
): Promise<true | string> {
  const result = await TestBed.runInInjectionContext(() =>
    guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
  );
  return result instanceof UrlTree
    ? router.serializeUrl(result)
    : (result as true);
}

describe('requireAuth', () => {
  it('sends a signed-out visitor to the login page, remembering where they were headed', async () => {
    const router = setup(null);

    expect(await run(requireAuth('admin'), '/admin', router)).toBe(
      '/login?returnUrl=%2Fadmin',
    );
  });

  it('lets a matching role through', async () => {
    const router = setup(admin);

    expect(await run(requireAuth('admin', 'manager'), '/admin', router)).toBe(
      true,
    );
  });

  it('accepts any signed-in role when none is required', async () => {
    const router = setup(plainUser);

    expect(await run(requireAuth(), '/account', router)).toBe(true);
  });

  it('redirects a signed-in user without the role to their own landing page', async () => {
    const router = setup(plainUser);

    expect(await run(requireAuth('admin', 'manager'), '/admin', router)).toBe(
      '/account',
    );
  });
});

describe('guestOnly', () => {
  it('shows the login page to a signed-out visitor', async () => {
    const router = setup(null);

    expect(await run(guestOnly, '/login', router)).toBe(true);
  });

  it('bounces an already signed-in admin to the panel', async () => {
    const router = setup(admin);

    expect(await run(guestOnly, '/login', router)).toBe('/admin');
  });
});
