import { Inject, Injectable } from '@nestjs/common';
import {
  BuildInfo,
  SETTING_CHANGES_PAGE_SIZE,
  SettingChange,
} from '@b2b-catalog-platform/shared/admin/platform';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/db/database.module';
import { settingChanges } from '../../platform/db/schema';
// eslint-disable-next-line boundaries/dependencies -- to turn around: accounts should give an actor's email
import { users } from '../../core/accounts/accounts-schema';
import { env } from '../../platform/env';
import { Database } from '../../platform/db/database';

/** What the operations page and the panel's footer read beside the switches. */
@Injectable()
export class OperationsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

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
   * The recent trail, newest first. Joined to `users` so a live account's
   * current address is shown; the stored copy is the fallback for an account
   * that is gone.
   */
  async listChanges(): Promise<SettingChange[]> {
    const rows = await this.db
      .select({
        id: settingChanges.id,
        kind: settingChanges.kind,
        area: settingChanges.area,
        enabled: settingChanges.enabled,
        changedAt: settingChanges.changedAt,
        email: users.email,
        storedEmail: settingChanges.changedByEmail,
      })
      .from(settingChanges)
      .leftJoin(users, eq(users.id, settingChanges.changedBy))
      .orderBy(desc(settingChanges.changedAt))
      .limit(SETTING_CHANGES_PAGE_SIZE);
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      area: row.area,
      enabled: row.enabled,
      changedAt: row.changedAt.toISOString(),
      actorEmail: row.email ?? row.storedEmail,
    }));
  }
}
