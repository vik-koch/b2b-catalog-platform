import { Injectable, signal } from '@angular/core';

/**
 * Whether the header's utility bar has slid out of view.
 *
 * It lives outside the header because the footer's back-to-top button keys off
 * the same moment: the reader has left the top of the page behind. One rule,
 * one threshold, and the two controls can never disagree about where the top
 * ends.
 */
@Injectable({ providedIn: 'root' })
export class HeaderCollapse {
  /** False on the server, so the first render is expanded and hydration matches. */
  readonly collapsed = signal(false);

  /**
   * Collapse once scrolled well off the top, and come back only at the very
   * top — mid-page the bar would slide down over content the reader is looking
   * at. Since nothing reflows, neither threshold can feed back into
   * `window.scrollY`, so no hysteresis gap is needed.
   */
  update(scrollY: number): void {
    const COLLAPSE_AT = 96;
    if (!this.collapsed() && scrollY > COLLAPSE_AT) {
      this.collapsed.set(true);
    } else if (this.collapsed() && scrollY <= 0) {
      this.collapsed.set(false);
    }
  }
}
