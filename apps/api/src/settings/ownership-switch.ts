import { Injectable, Logger } from '@nestjs/common';
import { OwnedAreas } from '@b2b-catalog-platform/shared/admin';
import { OwnershipArea } from '@b2b-catalog-platform/shared/sync';
import { SettingsStore } from '../platform/settings/settings-store';

/** The admin's ownership switch (FR-ADM-10). */
@Injectable()
export class OwnershipSwitch {
  private readonly logger = new Logger(OwnershipSwitch.name);

  constructor(private readonly store: SettingsStore) {}

  async read(): Promise<OwnedAreas> {
    return { ownedAreas: (await this.store.read()).externallyOwnedAreas };
  }

  /**
   * Hand areas over, or take them back. Idempotent: the areas are held as a
   * set, and an area already where it is asked to be records nothing.
   *
   * One change for the whole request, which is what lets the panel offer a
   * master switch without storing a fourth flag: the areas move together or
   * not at all.
   */
  async set(
    areas: readonly OwnershipArea[],
    owned: boolean,
    actor: { id: string; email: string },
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
        // One record per area that moved, never one naming the group: a record
        // naming no area would leave a gap in that area's own history.
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
