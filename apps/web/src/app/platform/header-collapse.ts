import { Injectable, signal } from '@angular/core';

/** Whether the header's utility bar has slid away: also when the footer's
 * back-to-top button wakes, so the two agree on where the top ends. */
@Injectable({ providedIn: 'root' })
export class HeaderCollapse {
  /** False on the server, so hydration matches. */
  readonly collapsed = signal(false);

  /** Back only at the very top: mid-page it would slide over what is read.
   * Nothing reflows, so no hysteresis gap is needed. */
  update(scrollY: number): void {
    const COLLAPSE_AT = 96;
    if (!this.collapsed() && scrollY > COLLAPSE_AT) {
      this.collapsed.set(true);
    } else if (this.collapsed() && scrollY <= 0) {
      this.collapsed.set(false);
    }
  }
}
