import { Injectable, signal } from '@angular/core';
import { OwnedAreas } from '@b2b-catalog-platform/shared/admin/platform';
import {
  OWNERSHIP_AREAS,
  OwnershipArea,
} from '@b2b-catalog-platform/shared/platform';
import { adminOwnershipContract } from '../../contract-routes.generated';
import { createOrpcClient } from '../../../shared/core/orpc-client';

/** The fail-closed answer: assume everything is owned rather than nothing. */
const ALL_AREAS: readonly OwnershipArea[] = OWNERSHIP_AREAS;

/**
 * Which areas an external system owns (FR-ADM-10), so the editors can grey
 * what the API would refuse. Cached for the app's lifetime: whoever flips the
 * switch comes back through a fresh editor load.
 */
@Injectable({ providedIn: 'root' })
export class OwnershipService {
  private readonly client = createOrpcClient(adminOwnershipContract);
  private readonly areas = signal<readonly OwnershipArea[] | null>(null);
  private readonly answered = signal<readonly OwnershipArea[] | null>(null);
  private inFlight?: Promise<readonly OwnershipArea[]>;

  /** Null until the answer arrives, which is not "nothing is owned". */
  readonly ownedAreas = this.areas.asReadonly();

  /** The API's own last answer, without the fail-closed stand-in. */
  readonly confirmed = this.answered.asReadonly();

  /** An unknown answer reads as not owned; a screen that paints during the
   * read asks `ownedAreas()` and decides for itself. */
  owns(area: OwnershipArea): boolean {
    return this.areas()?.includes(area) ?? false;
  }

  /** Fetch once per app instance; concurrent callers share the one request. */
  load(): Promise<readonly OwnershipArea[]> {
    return (this.inFlight ??= this.fetchAreas());
  }

  private async fetchAreas(): Promise<readonly OwnershipArea[]> {
    // Fails closed: better a needlessly greyed field than one the API refuses.
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

  /** Takes an answer the switch returned, so the editors see it too. */
  remember(answer: OwnedAreas): OwnedAreas {
    this.areas.set(answer.ownedAreas);
    this.answered.set(answer.ownedAreas);
    this.inFlight = Promise.resolve(answer.ownedAreas);
    return answer;
  }
}
