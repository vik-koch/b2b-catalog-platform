import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/** Session storage: the shelf somebody stood at is not one to hand back a
 * week later. */
const LAST_LISTING_KEY = 'last-listing';

/** A product page is not a listing to return to: the item just added is a
 * decision already made. */
const LISTING_PATHS = /^\/(catalog|search)(\/|\?|$)/;

export const DEFAULT_LISTING = '/catalog';

/** The last listing of this visit, page and filters included, so leaving the
 * cart returns to the shelf. The root component injects it, so it records
 * from the first navigation. */
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
