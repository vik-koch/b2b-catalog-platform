import { oc } from '@orpc/contract';
import * as z from 'zod';

/**
 * The public view of maintenance mode — just the on/off bit, no audit data.
 * Unauthenticated and exempt from the gate itself, so the storefront can learn
 * whether to show the maintenance screen even while the gate is on.
 */
export const maintenanceCheckSchema = z.object({
  enabled: z.boolean(),
});
export type MaintenanceCheck = z.infer<typeof maintenanceCheckSchema>;

export const maintenanceContract = {
  checkMaintenance: oc
    .route({
      method: 'GET',
      path: '/maintenance',
      summary: 'Public: is the storefront in maintenance mode?',
    })
    .output(maintenanceCheckSchema),
};
