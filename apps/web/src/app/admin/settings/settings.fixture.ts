import { Provider, signal } from '@angular/core';
import { OwnershipArea } from '@b2b-catalog-platform/shared/sync';
import { OwnershipService } from './ownership.service';

/**
 * A stand-in for the ownership read, for specs that render an admin screen
 * without an HTTP layer behind it.
 *
 * It is needed rather than optional because the real service fails *closed*: a
 * read that throws — which is what an unstubbed call does under TestBed — is
 * taken as "everything is owned", and the screen under test renders its locked
 * shape instead of the one the spec meant to assert on.
 */
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
      set: () => Promise.reject(new Error('not stubbed')),
    } satisfies Partial<OwnershipService>,
  };
}
