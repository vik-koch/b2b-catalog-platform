import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { MaintenanceService } from './maintenance.service';

/**
 * Client-side maintenance gate (FR-ADM-04). Redirects the public storefront to
 * the maintenance screen while the gate is on, letting an admin through to
 * preview the live shop.
 *
 * Browser-only on purpose. The authoritative SSR gate lives in server.ts, which
 * serves a cold load the screen with a proper 503 — a guard cannot, because an
 * SSR guard redirect is an HTTP redirect that may not carry a 503. So this runs
 * only after hydration: it covers in-app navigation (a visitor kept out, an
 * admin passing through to preview) and stays out of the SSR response entirely.
 *
 * The SSR gate reads the same readable session hint this does, so an admin's
 * cold load and their hydration agree — neither shows them the screen.
 */
export const maintenanceGate: CanActivateFn = async () => {
  const maintenance = inject(MaintenanceService);
  const auth = inject(AuthService);
  const router = inject(Router);

  // SSR is handled authoritatively by server.ts; never redirect during render.
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return true;
  }

  // Until /auth/me answers, the readable hint the server itself rendered for is
  // good enough to let the same admin through without an awaited round trip
  // between the hydrated page and its replacement. Only until: once the session
  // is resolved it is the answer, so signing out in-app closes the bypass.
  if (!auth.resolved() && auth.hintedRole() === 'admin') {
    return true;
  }

  if (!(await maintenance.isEnabled())) {
    return true;
  }

  await auth.whenResolved();
  if (auth.user()?.role === 'admin') {
    return true;
  }

  return router.createUrlTree(['/maintenance']);
};
