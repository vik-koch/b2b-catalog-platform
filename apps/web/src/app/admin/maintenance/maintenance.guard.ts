import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { passesMaintenance } from '@b2b-catalog-platform/shared';
import { AuthService } from '../../auth/auth.service';
import { MaintenanceService } from './maintenance.service';

/**
 * Client-side maintenance gate (FR-ADM-04). Redirects the storefront and a
 * customer's account pages to the maintenance screen while the gate is on,
 * letting staff through to preview the live shop.
 *
 * Browser-only on purpose. The authoritative SSR gate lives in server.ts, which
 * serves a cold load the screen with a proper 503 — a guard cannot, because an
 * SSR guard redirect is an HTTP redirect that may not carry a 503. So this runs
 * only after hydration: it covers in-app navigation (a visitor kept out, a
 * staff member passing through to preview) and stays out of the SSR response
 * entirely.
 *
 * The SSR gate reads the same readable session hint this does, so a staff
 * member's cold load and their hydration agree — neither shows them the screen.
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
  // good enough to let the same staff member through without an awaited round trip
  // between the hydrated page and its replacement. Only until: once the session
  // is resolved it is the answer, so signing out in-app closes the bypass.
  if (!auth.resolved() && passesMaintenance(auth.hintedRole())) {
    return true;
  }

  if (!(await maintenance.isEnabled())) {
    return true;
  }

  await auth.whenResolved();
  if (passesMaintenance(auth.user()?.role)) {
    return true;
  }

  return router.createUrlTree(['/maintenance']);
};
