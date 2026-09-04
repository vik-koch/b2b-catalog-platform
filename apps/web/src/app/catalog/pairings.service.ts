import { Injectable, signal } from '@angular/core';

/** Which product's counterparts are on screen, and how many the marker
 * promised — enough to draw the panel's heading before anything is fetched. */
export interface OpenPairings {
  slug: string;
  count: number;
}

/**
 * Which product's sold-together panel is open (FR-SET-05).
 *
 * The panel is a modal, so there is only ever one, and it is drawn once by the
 * app shell rather than by each of the several dozen markers a listing puts on
 * screen. That also keeps the marker off the panel's own import path: the panel
 * is made of product rows, and a row carries buying controls, and the controls
 * carry the marker.
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
