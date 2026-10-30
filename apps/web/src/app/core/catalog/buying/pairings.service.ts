import { Injectable, signal } from '@angular/core';

/** Enough to draw the panel's heading before anything is fetched. */
export interface OpenPairings {
  slug: string;
  count: number;
}

/**
 * Which product's sold-together panel is open (FR-SET-05). The shell draws the
 * one panel, not each marker: the panel is made of rows that carry the
 * controls that carry the marker, so the marker must not import it.
 */

@Injectable({ providedIn: 'root' })
export class PairingsService {
  private readonly openFor = signal<OpenPairings | null>(null);

  readonly open = this.openFor.asReadonly();

  show(slug: string, count: number): void {
    this.openFor.set({ slug, count });
  }

  close(): void {
    this.openFor.set(null);
  }
}
