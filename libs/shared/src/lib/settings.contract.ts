import { oc } from '@orpc/contract';
import * as z from 'zod';
import { commonAuthErrors } from './api-error';

/**
 * Runtime settings the admin controls from the panel.
 */
export const maintenanceStatusSchema = z.object({
  enabled: z.boolean(),
  /** ISO 8601. When the toggle was last changed. */
  updatedAt: z.iso.datetime(),
});
export type MaintenanceStatus = z.infer<typeof maintenanceStatusSchema>;

export const setMaintenanceSchema = z
  .object({
    enabled: z.boolean(),
  })
  .strict();
export type SetMaintenanceRequest = z.infer<typeof setMaintenanceSchema>;

/**
 * The public view of maintenance mode — just the on/off bit, no audit data.
 * Unauthenticated and exempt from the gate itself, so the storefront can learn
 * whether to show the maintenance screen even while the gate is on.
 */
export const maintenanceCheckSchema = z.object({
  enabled: z.boolean(),
});
export type MaintenanceCheck = z.infer<typeof maintenanceCheckSchema>;

/**
 * What is actually running, for the admin panel. Both fields are stamped onto
 * the stack at deploy time (infra/deploy.sh), not baked into the image: a
 * release retags the very image main already built, so anything baked at build
 * time could only ever report the commit sha, never the released version.
 */
export const buildInfoSchema = z.object({
  /** The deployed image tag — a semver for prod, `sha-<commit>` for dev. */
  version: z.string().nullable(),
  /** ISO 8601. When the running stack was deployed. */
  deployedAt: z.iso.datetime().nullable(),
});
export type BuildInfo = z.infer<typeof buildInfoSchema>;

export const settingsContract = {
  checkMaintenance: oc
    .route({
      method: 'GET',
      path: '/maintenance',
      summary: 'Public: is the storefront in maintenance mode?',
    })
    .output(maintenanceCheckSchema),

  getBuildInfo: oc
    .route({
      method: 'GET',
      path: '/settings/build-info',
      summary: 'What version is deployed, and since when (admin/manager only)',
    })
    .errors(commonAuthErrors)
    .output(buildInfoSchema),

  getMaintenance: oc
    .route({
      method: 'GET',
      path: '/settings/maintenance',
      summary: 'Read the maintenance-mode toggle (admin only)',
    })
    .errors(commonAuthErrors)
    .output(maintenanceStatusSchema),

  setMaintenance: oc
    .route({
      method: 'PUT',
      path: '/settings/maintenance',
      inputStructure: 'detailed',
      summary: 'Turn maintenance mode on or off (admin only)',
    })
    .errors(commonAuthErrors)
    .input(z.object({ body: setMaintenanceSchema }))
    .output(maintenanceStatusSchema),
};
