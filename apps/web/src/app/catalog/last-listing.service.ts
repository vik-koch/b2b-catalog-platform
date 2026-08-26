import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/** Where the last listing is remembered. Session-scoped: which shelf somebody
 * was standing at is not something to hand them back a week later. */
const LAST_LISTING_KEY = 'last-listing';

/** The listings "continue shopping" can return to — a category, a search, the
 * overview. A product page is deliberately not one: coming back to the item
 * that was just added is coming back to a decision already made. */
const LISTING_PATHS = /^\/(catalog|search)(\/|\?|$)/;

/** Where "continue shopping" goes when nothing has been visited yet. */
export const DEFAULT_LISTING = '/catalog';

/**
 * The last listing this visit stood at, so leaving the cart returns to the
 * shelf rather than to the front of the shop — with the category, the page and
 * the filters the URL was carrying.
 *
 * Instantiated by the root component so it records from the first navigation;
 * nothing has to ask it to start.
 */
@Injectable({ providedIn: 'root' })
export class LastListingService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly router = inject(Router);

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => this.record(event.urlAfterRedirects));
  }

  /** The remembered listing, or the catalog overview. Read on demand rather
   * than held in a signal: it is answered once, when a link is followed. */
  url(): string {
    if (!this.isBrowser) return DEFAULT_LISTING;
    try {
      const stored = sessionStorage.getItem(LAST_LISTING_KEY);
      return stored && LISTING_PATHS.test(stored) ? stored : DEFAULT_LISTING;
    } catch {
      return DEFAULT_LISTING;
    }
  }

  private record(url: string): void {
    if (!this.isBrowser || !LISTING_PATHS.test(url)) return;
    try {
      sessionStorage.setItem(LAST_LISTING_KEY, url);
    } catch {
      // A browser that will not remember the shelf still finds the catalog.
    }
  }
}
