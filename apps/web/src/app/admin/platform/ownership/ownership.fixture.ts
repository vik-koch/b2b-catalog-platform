import { Provider, signal } from '@angular/core';
import { OwnershipArea } from '@b2b-catalog-platform/shared/platform';
import { OwnershipService } from './ownership.service';

/** The ownership read for specs. Required: unstubbed, the real one fails
 * closed and every screen renders locked. */
export function provideOwnership(...areas: OwnershipArea[]): Provider {
  const owned = signal<readonly OwnershipArea[]>(areas);
  return {
    provide: OwnershipService,
    useValue: {
      ownedAreas: owned.asReadonly(),
      confirmed: owned.asReadonly(),
      owns: (area: OwnershipArea) => areas.includes(area),
      load: () => Promise.resolve(areas),
      read: () => Promise.resolve({ ownedAreas: areas }),
    } satisfies Partial<OwnershipService>,
  };
}
