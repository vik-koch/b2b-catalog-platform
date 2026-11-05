import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  computed,
  effect,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';
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
 * How the bottom bar's search tab reaches a field below `sm`, where the header
 * scrolls away: the header's own field while any of its row shows, else the
 * field over the page, which the search's navigation closes. Not a history
 * entry: popping one navigates, and the router then scrolls to the top.
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
  /** Whether a search field has the caret, set by the field. */
  private readonly focused = signal(false);
  /** Whether the visitor is searching, either way: lights the tab, which is
   * not a route. */
  readonly active = computed(() => this.open() || this.focused());

  constructor() {
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.open.set(false));

    if (!this.isBrowser) return;

    // A page scrolling under the keyboard would take the field with it.
    effect(() => this.hold(this.open()));
  }

  /** The header lends its field for as long as it is rendered. */
  register(anchor: SearchAnchor): void {
    this.anchor = anchor;
  }

  release(anchor: SearchAnchor): void {
    if (this.anchor === anchor) this.anchor = null;
  }

  /** The field reports the caret arriving and leaving. */
  setFocused(focused: boolean): void {
    this.focused.set(focused);
  }

  /** What the search tab does. */
  activate(): void {
    const row = this.anchor?.row;
    const rect = row?.getBoundingClientRect();
    // Partly on screen counts: the visitor can see the field.
    if (rect && rect.bottom > 0) {
      // Inside the gesture, or a mobile browser opens no keyboard.
      this.anchor?.focus();
      // Only for a half-hidden row: the results page's sticky field is whole.
      if (rect.top < 0) this.scrollToTop();
      return;
    }

    // Read now: by the time the page is held, the focused field has scrolled
    // it.
    this.heldAt = window.scrollY;
    this.open.set(true);
  }

  /** Fixes the body at its offset and scrolls it back after: `overflow:
   * hidden` alone loses the offset and jumps the page to its top. */
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
    // Instant: the page is handed back, not travelled.
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
