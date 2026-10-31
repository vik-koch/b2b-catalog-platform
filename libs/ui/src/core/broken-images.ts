import { signal } from '@angular/core';

/** The sources that failed to load, for drawing a placeholder in their place
 * rather than the browser's broken-image icon.
 *
 *   protected readonly broken = brokenImages();
 *   @if (broken.has(img.src)) { <ui-image-placeholder /> }
 *   @else { <img [src]="img.src" (error)="broken.add(img.src)" /> } */
export function brokenImages() {
  const sources = signal<ReadonlySet<string>>(new Set());
  return {
    has: (src: string) => sources().has(src),
    add: (src: string) => sources.update((set) => new Set(set).add(src)),
  };
}
