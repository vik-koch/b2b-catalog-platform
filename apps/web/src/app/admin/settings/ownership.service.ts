import { Injectable, signal } from '@angular/core';
import { OwnedAreas } from '@b2b-catalog-platform/shared/admin';
import {
  OWNERSHIP_AREAS,
  OwnershipArea,
} from '@b2b-catalog-platform/shared/sync';
import { adminOwnershipContract } from '../contract-routes.generated';
import { createOrpcClient } from '../../shared/core/orpc-client';

/** The fail-closed answer: assume everything is owned rather than nothing. */
const ALL_AREAS: readonly OwnershipArea[] = OWNERSHIP_AREAS;

/**
 * The admin's window onto external ownership (FR-ADM-10).
 *
 * The operations page reads and writes the switch. The editors read only
 * `ownedAreas`, so they can grey what they will not be allowed to save; that
 * read is cached for the app's lifetime, because an admin who flips the switch
 * is on the switch's own page and comes back through a fresh editor load.
 *
 * Nothing here decides anything. The API refuses the write regardless of what
 * the browser believes; this is only what stops somebody typing into a field
 * that is going to be rejected.
 */
@Injectable({ providedIn: 'root' })
export class OwnershipService {
  private readonly client = createOrpcClient(adminOwnershipContract);
  private readonly areas = signal<readonly OwnershipArea[] | null>(null);
  private readonly answered = signal<readonly OwnershipArea[] | null>(null);
  private inFlight?: Promise<readonly OwnershipArea[]>;

  /**
   * What the editors read. Null until the answer arrives, which is not the
   * same as "nothing is owned": an editor should not paint a field editable
   * only to grey it a moment later.
   */
  readonly ownedAreas = this.areas.asReadonly();

  /**
   * The last answer the API actually gave, or null. Unlike `ownedAreas` it has
   * no fail-closed stand-in: the panel's chips claim a state only when the API
   * said so.
   */
  readonly confirmed = this.answered.asReadonly();

  /**
   * One area's answer, for the screens that only ever ask about one. Null (the
   * answer has not arrived) reads as "not owned" here, because these are asked
   * from a click that happens long after `load()` resolved; a screen that
   * paints itself during the read asks `ownedAreas()` directly and decides for
   * itself what an unknown answer looks like.
   */
  owns(area: OwnershipArea): boolean {
    return this.areas()?.includes(area) ?? false;
  }

  /** Fetch once per app instance; concurrent callers share the one request. */
  load(): Promise<readonly OwnershipArea[]> {
    return (this.inFlight ??= this.fetchAreas());
  }

  private async fetchAreas(): Promise<readonly OwnershipArea[]> {
    // Fails *closed*, unlike the public maintenance read: guessing "nothing is
    // owned" would offer an admin fields the API is about to refuse, which is a
    // worse few minutes than a greyed field that did not need to be.
    try {
      return this.remember(await this.client.getOwnership()).ownedAreas;
    } catch {
      this.areas.set([...ALL_AREAS]);
      return ALL_AREAS;
    }
  }

  /** The switch's own page reads the truth, never the cache. */
  async read(): Promise<OwnedAreas> {
    return this.remember(await this.client.getOwnership());
  }

  /** One area or every area: the master switch is the same call with the
   * whole list, so it lands as one transaction and one history entry. */
  async set(
    areas: readonly OwnershipArea[],
    owned: boolean,
  ): Promise<OwnedAreas> {
    return this.remember(
      await this.client.setOwnership({ body: { areas: [...areas], owned } }),
    );
  }

  private remember(answer: OwnedAreas): OwnedAreas {
    this.areas.set(answer.ownedAreas);
    this.answered.set(answer.ownedAreas);
    this.inFlight = Promise.resolve(answer.ownedAreas);
    return answer;
  }
}
