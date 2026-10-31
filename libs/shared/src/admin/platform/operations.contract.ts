import { oc } from '@orpc/contract';
import * as z from 'zod';
import { commonAuthErrors } from '../../lib/core/api-error';
import { SETTING_CHANGE_KINDS, SETTING_CHANGES_PAGE_SIZE } from './operations';

/**
 * What is actually running, for the admin panel. Both fields are stamped onto
 * the stack at deploy time (infra/deploy.sh), not baked into the image: a
 * release retags the very image main already built, so anything baked at build
 * time could only ever report the commit sha, never the released version.
 */
export const buildInfoSchema = z.object({
  version: z.string().nullable(),
  deployedAt: z.iso.datetime().nullable(),
});
export type BuildInfo = z.infer<typeof buildInfoSchema>;

/**
 * One recorded change to a runtime setting. Denormalized like every other
 * audit row here (`sync_runs.actorEmail`, `api_tokens.createdByEmail`): the
 * trail still names who did it once the account is gone.
 */
export const settingChangeSchema = z.object({
  id: z.uuid(),
  kind: z.enum(SETTING_CHANGE_KINDS),
  area: z.string().nullable(),
  enabled: z.boolean(),
  changedAt: z.iso.datetime(),
  actorEmail: z.string().nullable(),
});
export type SettingChange = z.infer<typeof settingChangeSchema>;

export const adminOperationsContract = {
  getBuildInfo: oc
    .route({
      method: 'GET',
      path: '/settings/build-info',
      summary: 'What version is deployed, and since when (admin/manager only)',
    })
    .errors(commonAuthErrors)
    .output(buildInfoSchema),

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
