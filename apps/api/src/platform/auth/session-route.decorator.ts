import { SetMetadata } from '@nestjs/common';

export const SESSION_ROUTE = 'sessionRoute';

/**
 * A route of the session itself, which answers whatever state the shop is in:
 * the web's own gates ask `me` to tell staff from customers. Platform's way
 * of saying what `@MaintenanceExempt()` says for an area's routes.
 */
export const SessionRoute = () => SetMetadata(SESSION_ROUTE, true);
