import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/** What the header lends this so a tap can reach its field. */
export interface SearchAnchor {
  /** The row the field sits in, for asking whether it is on screen. */
  readonly row: HTMLElement;
  /** Puts the caret in the field, synchronously. */
  focus(): void;
}

/**
 * How the bottom bar's search tab reaches a search field, below `sm`.
 *
 * Two answers, because the header is not sticky there: while any part of its
 * search row is still on screen the tap belongs to that field and simply puts
 * the caret in it, which is what a visitor who can see the field expects a
 * search button to do. Once the row has scrolled away there is nothing to
 * focus, so the tap opens the field over the page instead, with the page held
 * still behind it.
 *
 * The overlay closes on the navigation that a search causes, so submitting a
 * query or picking a suggestion needs no separate dismissal.
 *
 * Android's back closes the keyboard and then leaves the page: the overlay is
 * not a history entry of its own. It was, briefly — and popping that entry
 * made the router navigate, which this app answers by scrolling to the top
 * (see `withInMemoryScrolling` in app.config.ts), so every dismissal threw
 * away the visitor's place. Giving the gesture something to consume means
 * teaching the router that this particular navigation keeps its scroll, which
 * is a bigger change than the gesture is worth.
 */
@Injectable({ providedIn: 'root' })
export class MobileSearch {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private anchor: SearchAnchor | null = null;
  /** Whether the page is being held, and the offset it was held at. */
  private held = false;
  private heldAt = 0;

  /** Whether the field is open over the page. */
  readonly open = signal(false);

  constructor() {
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.open.set(false));

    if (!this.isBrowser) return;

    // The page behind the overlay must not move: a page that scrolls under a
    // keyboard takes the field with it, which is the whole reason the field
    // left the header.
    effect(() => this.hold(this.open()));
  }

  /** The header lends its field for as long as it is rendered. */
  register(anchor: SearchAnchor): void {
    this.anchor = anchor;
  }

  release(anchor: SearchAnchor): void {
    if (this.anchor === anchor) this.anchor = null;
  }

  /** What the search tab does. */
  activate(): void {
    const row = this.anchor?.row;
    const rect = row?.getBoundingClientRect();
    // Partly on screen counts: the visitor can see the field, so taking them
    // to it reads as the page answering rather than as a new surface.
    if (rect && rect.bottom > 0) {
      // Synchronously, and inside the gesture: a mobile browser opens its
      // keyboard for a focus that happened in the tap and not for one a tick
      // later.
      this.anchor?.focus();
      // Only where the row is not already whole. Half of it showing means the
      // page has moved on and the rest of the header is worth uncovering; on
      // the results page, where the field is sticky and always whole, a scroll
      // to the top would be the button throwing away the visitor's place for
      // nothing.
      if (rect.top < 0) this.scrollToTop();
      return;
    }

    // Read here rather than where the page is actually held: by then the
    // overlay has been rendered and its field focused, and a browser will
    // scroll a focused field into view — so the offset to give back would be
    // the one after that scroll rather than the one the visitor was at.
    this.heldAt = window.scrollY;
    this.open.set(true);
  }

  /**
   * Holds the page still behind the overlay, and puts it back exactly where it
   * was afterwards.
   *
   * `overflow: hidden` alone is not enough: taking the scrollability off the
   * document loses the offset with it, so the page jumps to its top — visibly,
   * through the dimming — and stays there once the field is dismissed. So the
   * body is lifted by the offset it was scrolled to and fixed there, which
   * leaves the same pixels on screen, and the offset is scrolled back on the
   * way out.
   */
  private hold(open: boolean): void {
    if (open === this.held) return;
    this.held = open;
    const root = this.document.documentElement;
    const body = this.document.body;

    if (open) {
      body.style.top = `-${this.heldAt}px`;
      root.classList.add('search-locked');
      return;
    }

    root.classList.remove('search-locked');
    body.style.top = '';
    // Instant, and not through scrollToTop: this is not a journey, it is the
    // page being handed back unchanged.
    window.scrollTo({ top: this.heldAt, behavior: 'auto' });
  }

  /** Smoothly, unless the visitor has asked for less movement. */
  private scrollToTop(): void {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    window.scrollTo({ top: 0, behavior: still?.matches ? 'auto' : 'smooth' });
  }

  close(): void {
    this.open.set(false);
  }
}
