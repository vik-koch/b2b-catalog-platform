import { oc } from '@orpc/contract';
import * as z from 'zod';

export const maintenanceCheckSchema = z.object({
  enabled: z.boolean(),
});
export type MaintenanceCheck = z.infer<typeof maintenanceCheckSchema>;

export const maintenanceContract = {
  /** Open to anyone and exempt from the gate, so a visitor learns it is on. */
  checkMaintenance: oc
    .route({
      method: 'GET',
      path: '/maintenance',
      summary: 'Public: is the storefront in maintenance mode?',
    })
    .output(maintenanceCheckSchema),
};
