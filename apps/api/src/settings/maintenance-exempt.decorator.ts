import { SetMetadata } from '@nestjs/common';

export const MAINTENANCE_EXEMPT = 'maintenanceExempt';

/**
 * Marks a route that must stay reachable while maintenance mode is on even
 * though it is not staff-only — the login endpoint, health probes, the session's
 * own `me`. Routes behind a staff-only `@Auth(...)` are exempt automatically
 * (the guard reads their role metadata), so this is only for the handful of
 * public-but-essential routes.
 */
export const MaintenanceExempt = () => SetMetadata(MAINTENANCE_EXEMPT, true);
