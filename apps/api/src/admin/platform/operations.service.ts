import { Inject, Injectable } from '@nestjs/common';
import { desc } from 'drizzle-orm';

import {
  BuildInfo,
  SETTING_CHANGES_PAGE_SIZE,
  SettingChange,
} from '@b2b-catalog-platform/shared/admin/platform';

import { ACTOR_EMAILS, ActorEmails } from '../../platform/actor-emails';
import { Database } from '../../platform/db/database';
import { DRIZZLE } from '../../platform/db/database.module';
import { settingChanges } from '../../platform/db/schema';
import { env } from '../../platform/env';

/** What the operations page and the panel's footer read beside the switches. */
@Injectable()
export class OperationsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(ACTOR_EMAILS) private readonly actors: ActorEmails,
  ) {}

  /**
   * What is deployed, straight from the environment the stack was started
   * with. Both are absent outside a deployed stack (local dev), which the
   * panel renders as "unknown".
   */
  getBuildInfo(): BuildInfo {
    return {
      version: env.APP_VERSION ?? null,
      deployedAt: env.APP_DEPLOYED_AT ?? null,
    };
  }

  /**
   * The recent trail, newest first. A live account shows its current
   * address; the stored copy is the fallback for an account that is gone.
   */
  async listChanges(): Promise<SettingChange[]> {
    const rows = await this.db
      .select({
        id: settingChanges.id,
        kind: settingChanges.kind,
        area: settingChanges.area,
        enabled: settingChanges.enabled,
        changedAt: settingChanges.changedAt,
        changedBy: settingChanges.changedBy,
        storedEmail: settingChanges.changedByEmail,
      })
      .from(settingChanges)
      .orderBy(desc(settingChanges.seq))
      .limit(SETTING_CHANGES_PAGE_SIZE);
    const emails = await this.actors.currentOf(
      rows.flatMap((row) => row.changedBy ?? []),
    );
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      area: row.area,
      enabled: row.enabled,
      changedAt: row.changedAt.toISOString(),
      actorEmail:
        (row.changedBy && emails.get(row.changedBy)) ?? row.storedEmail,
    }));
  }
}
