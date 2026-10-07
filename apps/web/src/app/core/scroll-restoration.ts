import { ViewportScroller } from '@angular/common';
import { ApplicationRef, DestroyRef, Injectable, inject } from '@angular/core';
import { NavigationStart, Router, Scroll } from '@angular/router';

/** How long a back step waits for its page before giving up on the offset. */
const SETTLE_LIMIT_MS = 2000;

/** What says the visitor has started scrolling for themselves. */
const VISITOR_INPUT = ['wheel', 'touchstart', 'keydown', 'pointerdown'];

/**
 * Back and forward return to where the visitor left the page, once the page
 * is there to return to.
 *
 * The router restores the offset a frame after the navigation ends, which is
 * before a listing has loaded: the page is still short, so the offset is
 * clamped and the visitor lands near the top. This repeats the restore once
 * the application is stable — every resource and request settled, so the page
 * is as long as it is going to be.
 *
 * It stands down if the visitor scrolls, clicks or types in the meantime, if
 * another navigation starts, or if the page takes too long: an offset applied
 * seconds later moves the page under somebody already reading it.
 */
@Injectable({ providedIn: 'root' })
export class ScrollRestoration {
  private readonly appRef = inject(ApplicationRef);
  private readonly scroller = inject(ViewportScroller);
  private navigations = 0;

  constructor() {
    const events = inject(Router).events.subscribe((e) => {
      if (e instanceof NavigationStart) this.navigations++;
      else if (
        e instanceof Scroll &&
        e.position &&
        e.scrollBehavior !== 'manual'
      )
        void this.restore(e.position);
    });
    inject(DestroyRef).onDestroy(() => events.unsubscribe());
  }

  private async restore(target: [number, number]): Promise<void> {
    const navigation = this.navigations;
    let interrupted = false;
    const interrupt = () => (interrupted = true);
    for (const type of VISITOR_INPUT)
      window.addEventListener(type, interrupt, { passive: true, once: true });

    try {
      await Promise.race([
        this.appRef.whenStable(),
        new Promise((resolve) => setTimeout(resolve, SETTLE_LIMIT_MS)),
      ]);
      if (interrupted || navigation !== this.navigations) return;
      const [x, y] = this.scroller.getScrollPosition();
      if (x === target[0] && y === target[1]) return;
      this.scroller.scrollToPosition(target, { behavior: 'instant' });
    } finally {
      for (const type of VISITOR_INPUT)
        window.removeEventListener(type, interrupt);
    }
  }
}
