import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { UserRole } from '@b2b-catalog-platform/shared/platform';

import { AuthService } from './auth.service';

/** Where a role lands after signing in. */
export function landingFor(role: UserRole): string {
  return role === 'user' ? '/account' : '/admin';
}

/** The session once known. Injects before awaiting: an injection context is
 * only guaranteed synchronously. */
async function resolvedSession() {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenResolved();
  return { user: auth.user(), router };
}

/**
 * A session, and optionally a role. Convenience only: the API checks every
 * request. The guarded routes render in the browser, so the session is known,
 * and awaiting it keeps a gated page from flashing past a redirect.
 */
export function requireAuth(...roles: UserRole[]): CanActivateFn {
  return async (_route, state) => {
    const { user, router } = await resolvedSession();
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

/** Staff opening a customer's order link land on that order in the admin
 * panel, where staff own none; a guest is `requireAuth`'s. */
export function staffToAdminOrder(): CanActivateFn {
  return async (route) => {
    const { user, router } = await resolvedSession();
    if (!user || user.role === 'user') return true;

    const reference = route.paramMap.get('reference');
    return router.createUrlTree(
      reference ? ['/admin/orders', reference] : ['/admin/orders'],
    );
  };
}

/** Keeps the login page from showing to someone already signed in. */
export const guestOnly: CanActivateFn = async () => {
  const { user, router } = await resolvedSession();
  return user ? router.createUrlTree([landingFor(user.role)]) : true;
};
