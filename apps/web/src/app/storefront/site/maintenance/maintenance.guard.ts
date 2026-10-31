import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { passesMaintenance } from '@b2b-catalog-platform/shared';
import { AuthService } from '../../../shared/auth/auth.service';
import { MaintenanceService } from '../../../core/site/maintenance.service';

/**
 * The gate for in-app navigation, letting staff through. Browser-only: a cold
 * load is gated in server.ts, since a guard's redirect cannot carry a 503.
 */
export const maintenanceGate: CanActivateFn = async () => {
  const maintenance = inject(MaintenanceService);
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return true;
  }

  // The hint the server rendered for lets staff through until the session is
  // known, without a round trip; after that the session decides.
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
