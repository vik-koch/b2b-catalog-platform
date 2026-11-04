import { Injectable, Logger } from '@nestjs/common';
import { OwnedAreas } from '@b2b-catalog-platform/shared/admin/platform';
import { OwnershipArea } from '@b2b-catalog-platform/shared/platform';
import { Actor } from '../../core/exchange/sync-run';
import { SettingsStore } from '../../platform/settings/settings-store';

/** The admin's ownership switch (FR-ADM-10). */
@Injectable()
export class OwnershipSwitch {
  private readonly logger = new Logger(OwnershipSwitch.name);

  constructor(private readonly store: SettingsStore) {}

  /**
   * Idempotent: an area already where it is asked to be records nothing. One
   * change for the whole request, so the areas move together or not at all.
   */
  async set(
    areas: readonly OwnershipArea[],
    owned: boolean,
    actor: Actor,
  ): Promise<OwnedAreas> {
    let moved: OwnershipArea[] = [];
    const row = await this.store.change(actor, (before) => {
      const current = new Set<OwnershipArea>(before.externallyOwnedAreas);
      moved = areas.filter((area) => current.has(area) !== owned);
      for (const area of areas) {
        if (owned) current.add(area);
        else current.delete(area);
      }
      return {
        set: { externallyOwnedAreas: [...current] },
        // One record per area, so each area's own history stays whole.
        record: moved.map((area) => ({
          kind: 'ownership' as const,
          area,
          enabled: owned,
        })),
      };
    });
    if (moved.length) {
      this.logger.log(
        `${moved.join(', ')} ${moved.length > 1 ? 'are' : 'is'} ${
          owned ? 'now externally owned' : 'no longer externally owned'
        }`,
      );
    }
    return { ownedAreas: row.externallyOwnedAreas };
  }
}
