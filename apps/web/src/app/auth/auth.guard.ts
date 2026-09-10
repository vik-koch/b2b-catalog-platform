import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserRole } from '@b2b-catalog-platform/shared';
import { AuthService } from './auth.service';

/**
 * Where a role belongs after signing in. Staff land in the admin panel, plain
 * users on their own account page — one login, two destinations, rather than
 * one page that branches on role.
 */
export function landingFor(role: UserRole): string {
  return role === 'user' ? '/account' : '/admin';
}

/**
 * Gates a route on a session, optionally on specific roles.
 *
 * Convenience only: it saves an unauthorized visitor from staring at a shell
 * that would fail every request it makes. The real check is server-side, on
 * each request, against the database role — never assume this stopped anyone.
 *
 * Only ever runs in the browser: the routes it guards are client-rendered
 * (app.routes.server.ts), so the session is always knowable here. Awaiting it
 * before activation is what keeps a gated page from flashing past a visitor who
 * is about to be redirected.
 */
export function requireAuth(...roles: UserRole[]): CanActivateFn {
  return async (_route, state) => {
    // All injections happen before the first await: an injection context is
    // only guaranteed synchronously.
    const auth = inject(AuthService);
    const router = inject(Router);

    await auth.whenResolved();
    const user = auth.user();

    if (!user) {
      return router.createUrlTree(['/login'], {
        queryParams: { returnUrl: state.url },
      });
    }

    return (
      roles.length === 0 ||
      roles.includes(user.role) ||
      router.createUrlTree([landingFor(user.role)])
    );
  };
}

/**
 * Sends staff who open a customer's order link to the same order in the admin
 * panel.
 *
 * The two screens are not the same screen and never will be — one answers an
 * order, the other reads one — so they keep their own routes. What they share
 * is the reference, which is the identity a customer quotes down the phone: a
 * manager handed `/account/orders/AB-1234` should land on that order, not on a
 * page that would 404 at them because staff own no orders.
 *
 * Only for a session that has one. A guest is left to `requireAuth`, which
 * sends them to sign in and back here afterwards.
 */
export function staffToAdminOrder(): CanActivateFn {
  return async (route) => {
    const auth = inject(AuthService);
    const router = inject(Router);

    await auth.whenResolved();
    const user = auth.user();
    if (!user || user.role === 'user') return true;

    const reference = route.paramMap.get('reference');
    return router.createUrlTree(
      reference ? ['/admin/orders', reference] : ['/admin/orders'],
    );
  };
}

/** Keeps the login page from showing to someone already signed in. */
export const guestOnly: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenResolved();
  const user = auth.user();

  return user ? router.createUrlTree([landingFor(user.role)]) : true;
};
