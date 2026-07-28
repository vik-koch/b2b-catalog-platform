import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

/**
 * Runtime settings the admin controls from the panel.
 */
export const maintenanceStatusSchema = z.object({
  enabled: z.boolean(),
  /** ISO 8601. When the toggle was last changed. */
  updatedAt: z.string().datetime(),
});
export type MaintenanceStatus = z.infer<typeof maintenanceStatusSchema>;

export const setMaintenanceSchema = z
  .object({
    enabled: z.boolean(),
  })
  .strict();
export type SetMaintenanceRequest = z.infer<typeof setMaintenanceSchema>;

export const settingsContract = c.router({
  getMaintenance: {
    method: 'GET',
    path: '/settings/maintenance',
    responses: {
      200: maintenanceStatusSchema,
      401: z.object({ message: z.string() }),
      403: z.object({ message: z.string() }),
    },
    summary: 'Read the maintenance-mode toggle (admin only)',
  },
  setMaintenance: {
    method: 'PUT',
    path: '/settings/maintenance',
    body: setMaintenanceSchema,
    responses: {
      200: maintenanceStatusSchema,
      401: z.object({ message: z.string() }),
      403: z.object({ message: z.string() }),
    },
    summary: 'Turn maintenance mode on or off (admin only)',
  },
});
