import { SetMetadata } from '@nestjs/common';

export const MAINTENANCE_EXEMPT = 'maintenanceExempt';

/**
 * A public route that must answer while the shop is closed: sign-in, health
 * probes. A staff-only `@Auth(...)` route needs none, nor a `@SessionRoute()`.
 */
export const MaintenanceExempt = () => SetMetadata(MAINTENANCE_EXEMPT, true);
