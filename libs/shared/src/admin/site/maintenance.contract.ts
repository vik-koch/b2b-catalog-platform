import { oc } from '@orpc/contract';
import * as z from 'zod';
import { commonAuthErrors } from '../../lib/core/api-error';
import { maintenanceCheckSchema } from '../../core/site/maintenance.contract';

export const setMaintenanceSchema = z
  .object({
    enabled: z.boolean(),
  })
  .strict();

export const adminMaintenanceContract = {
  getMaintenance: oc
    .route({
      method: 'GET',
      path: '/settings/maintenance',
      summary: 'Is maintenance mode on (admin only)',
    })
    .errors(commonAuthErrors)
    .output(maintenanceCheckSchema),

  setMaintenance: oc
    .route({
      method: 'PUT',
      path: '/settings/maintenance',
      inputStructure: 'detailed',
      summary: 'Turn maintenance mode on or off (admin only)',
    })
    .errors(commonAuthErrors)
    .input(z.object({ body: setMaintenanceSchema }))
    .output(maintenanceCheckSchema),
};
