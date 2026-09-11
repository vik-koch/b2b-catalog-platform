import { oc } from '@orpc/contract';
import * as z from 'zod';
import { commonAuthErrors } from './api-error';
import { OWNERSHIP_AREAS } from './ownership-constants';
import {
  SETTING_CHANGE_KINDS,
  SETTING_CHANGES_PAGE_SIZE,
} from './settings-constants';

/**
 * The runtime settings singleton, whole — one row in the database, one shape on
 * the wire. Both switches are read by the same screen and written by the same
 * hand, so they are answered together rather than asked for one at a time; the
 * single `updatedAt` is the row's, which is why there is one of it and not one
 * per switch.
 *
 * `ownedAreas` is which areas of the platform's data an external system
 * currently owns (FR-ADM-10). An area in this list is one the platform's own
 * ways in are closed for; an area absent from it is one the automated exchange
 * is closed for. There is no third state — that mutual exclusion is the whole
 * point, since two writers for one column has no answer to "who changed this".
 */
export const appSettingsSchema = z.object({
  maintenanceEnabled: z.boolean(),
  ownedAreas: z.array(z.enum(OWNERSHIP_AREAS)),
  /** ISO 8601. When any of it was last changed. */
  updatedAt: z.iso.datetime(),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

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

/** One area, one direction — areas are independent and are set one at a time. */
export const setOwnershipSchema = z
  .object({
    area: z.enum(OWNERSHIP_AREAS),
    owned: z.boolean(),
  })
  .strict();
export type SetOwnershipRequest = z.infer<typeof setOwnershipSchema>;

/**
 * One recorded change to a runtime setting. Denormalized like every other
 * audit row here (`sync_runs.actorEmail`, `api_tokens.createdByEmail`): the
 * trail still names who did it once the account is gone.
 */
export const settingChangeSchema = z.object({
  id: z.uuid(),
  kind: z.enum(SETTING_CHANGE_KINDS),
  /** Which area, for an ownership change; null for a setting without parts. */
  area: z.string().nullable(),
  /** Which way it was moved. */
  enabled: z.boolean(),
  changedAt: z.iso.datetime(),
  /** Null where the change predates a signed-in actor, or the account is gone. */
  actorEmail: z.string().nullable(),
});
export type SettingChange = z.infer<typeof settingChangeSchema>;

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

  getSettings: oc
    .route({
      method: 'GET',
      path: '/settings',
      summary: 'Read the runtime settings (admin only)',
    })
    .errors(commonAuthErrors)
    .output(appSettingsSchema),

  setMaintenance: oc
    .route({
      method: 'PUT',
      path: '/settings/maintenance',
      inputStructure: 'detailed',
      summary: 'Turn maintenance mode on or off (admin only)',
    })
    .errors(commonAuthErrors)
    .input(z.object({ body: setMaintenanceSchema }))
    .output(appSettingsSchema),

  setOwnership: oc
    .route({
      method: 'PUT',
      path: '/settings/ownership',
      inputStructure: 'detailed',
      summary: 'Hand one area to an external system, or take it back (admin)',
    })
    .errors(commonAuthErrors)
    .input(z.object({ body: setOwnershipSchema }))
    .output(appSettingsSchema),

  listSettingChanges: oc
    .route({
      method: 'GET',
      path: '/settings/changes',
      summary: 'Recent changes to the runtime settings (admin only)',
    })
    .errors(commonAuthErrors)
    .output(
      z.object({
        changes: z.array(settingChangeSchema).max(SETTING_CHANGES_PAGE_SIZE),
      }),
    ),
};
