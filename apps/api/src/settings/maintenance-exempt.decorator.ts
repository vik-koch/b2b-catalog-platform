import { SetMetadata } from '@nestjs/common';

export const MAINTENANCE_EXEMPT = 'maintenanceExempt';

/**
 * Marks a route that must stay reachable while maintenance mode is on even
 * though it is unauthenticated — the login endpoint and health probes. Routes
 * behind `@Auth(...)` are exempt automatically (the guard detects their role
 * metadata), so this is only for the handful of public-but-essential routes.
 */
export const MaintenanceExempt = () => SetMetadata(MAINTENANCE_EXEMPT, true);
