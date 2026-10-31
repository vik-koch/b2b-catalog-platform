import { SetMetadata } from '@nestjs/common';

export const MAINTENANCE_EXEMPT = 'maintenanceExempt';

/**
 * A public route that must answer while the shop is closed: sign-in, health
 * probes, the session's own `me`. A staff-only `@Auth(...)` route needs none.
 */
export const MaintenanceExempt = () => SetMetadata(MAINTENANCE_EXEMPT, true);
