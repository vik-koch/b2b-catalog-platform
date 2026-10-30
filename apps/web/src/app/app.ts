import { Component, computed, DOCUMENT, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { EditModeToggle } from './admin/edit-mode-toggle';
import { ForcePasswordChange } from './storefront/auth/force-password-change';
import { CartFigures } from './storefront/cart/cart-figures';
import { LastListingService } from './storefront/catalog/last-listing.service';
import { PairingsService } from './core/catalog/pairings.service';
import { ProductPairingsDialog } from './storefront/catalog/product-pairings-dialog';
import { DeploymentConfig } from '@b2b-catalog-platform/shared';
import { DEPLOYMENT_CONFIG } from './shared/config/deployment-config';
import { CookieConsent } from './storefront/consent/cookie-consent';
import { shopTitle } from './shared/core/page-seo';
import { BottomNav } from './storefront/layout/bottom-nav';
import { Footer } from './storefront/layout/footer';
import { Header } from './storefront/layout/header';
import { SearchOverlay } from './storefront/layout/search-overlay';
import { SiteNotice } from './storefront/layout/site-notice';

@Component({
  imports: [
    RouterOutlet,
    SiteNotice,
    Header,
    BottomNav,
    SearchOverlay,
    Footer,
    CookieConsent,
    ForcePasswordChange,
    EditModeToggle,
    ProductPairingsDialog,
  ],
  selector: 'app-root',
  template: `
    <!-- A recessed grey behind the signed-out screens, so the white card the auth pages
         draw has something to sit on; the ordinary page background otherwise.
         Bound rather than toggled with a second class: two background
         utilities on one element would be decided by stylesheet order. -->
    <div class="flex min-h-dvh flex-col text-ink" [class]="pageBackground()">
      <!-- Above the header and scrolled away with the page; the header's
           stickiness starts where the notice ends. -->
      <app-site-notice />
      <app-header />
      <!-- The wide frame, and one of only two page widths. Anything
           multi-column — catalog grids, admin tables, dashboards — fills it;
           a single-column form or reading column takes max-w-xl inside it.
           Those narrow columns are centered only on the signed-out screens
           (login, register, password reset), where the page is the whole task;
           inside the app they stay left, under a left-aligned heading. -->
      <!-- Clipped sideways, and the one place in the app it has to be done.
           A phone browser sizes its layout viewport to whatever the content
           lays out to, so anything overhanging the right edge — a popover
           against a card at the edge, for a single frame before it is measured
           and pulled back — widens the viewport itself, stretches every fixed
           bar to the new width and leaves the page scrolling sideways. The
           same rule on body cannot do this: body's overflow propagates to the
           viewport, so the body element itself still lays out as visible.
           Clipping here, one level in, actually clips.

           Nothing is meant to be reached by scrolling sideways — what does not
           fit (a wide table, a code block) scrolls inside its own box — and
           clip rather than hidden so this never becomes a scroll container
           the header's own stickiness would have to answer to.

           The clip is the window's width and the page's column is inside it,
           so a band drawn from edge to edge (the main page's top) reaches the
           edges on a wide screen too, and is still clipped where they are. -->
      <main class="mb-4 w-full flex-1 overflow-x-clip">
        <div class="mx-auto w-full max-w-328 p-4">
          <router-outlet />
        </div>
      </main>
      <!-- Admin-only storefront edit-mode toggle; empty for everyone else, and
           for any page with nothing on it to edit. Between the page and the
           footer, which is the line it comes to rest on. -->
      <app-edit-mode-toggle />
      <!-- No top border where the page behind it is already the footer's grey: the line
           would divide two areas of the same colour. -->
      <app-footer [seamless]="centered()" />
      <!-- The bottom bar is fixed, so it covers whatever the page ends with.
           The reserve is on the column rather than on <main>, because the
           footer is what actually reaches the bottom edge. -->
      <div
        aria-hidden="true"
        class="h-[calc(3.5rem+1px+env(safe-area-inset-bottom))] sm:hidden"
      ></div>
    </div>
    <!-- One panel for every sold-together marker on the page (FR-SET-05): it
         is a modal, so there is only ever one open, and drawing it here keeps
         it off the import path of the rows it is made of.

         Deferred, because it is made of product rows and would otherwise pull
         the whole buying block into the first load for a panel most visits
         never open. It is opened by a click, so the chunk has a moment to
         arrive while the request for its contents is in flight. -->
    @defer (when pairings.open() !== null) {
      <app-product-pairings-dialog />
    }
    <app-bottom-nav />
    <!-- The phone's search field over the page, opened from the bottom bar
         once the header's own has scrolled away. -->
    <app-search-overlay />
    <app-cookie-consent />
    <!-- Renders nothing unless a signed-in account still owes a password
         change, so public pages carry only the (empty) component instance. -->
    <app-force-password-change />
  `,
})
export class App {
  protected branding = inject(DEPLOYMENT_CONFIG).branding;
  /** Which sold-together panel is open — what the deferred block waits on. */
  protected readonly pairings = inject(PairingsService);
  private readonly router = inject(Router);

  /**
   * Whether the active route asked for the signed-out treatment. Seeded from
   * the router's own snapshot rather than waiting for a navigation event, so
   * the first render already has it — a page that arrived white and turned
   * grey would flash.
   */
  protected readonly centered = signal(this.isCenteredRoute());

  /** A recessed grey behind the auth card, the ordinary page background otherwise. */
  protected readonly pageBackground = computed(() =>
    this.centered() ? 'bg-surface' : 'bg-surface-subtle',
  );

  private isCenteredRoute(): boolean {
    let route = this.router.routerState.snapshot.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    return route.data['layout'] === 'centered';
  }

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.centered.set(this.isCenteredRoute()));

    // Set the document title from the per-deployment config rather than the
    // baked index.html, so overriding branding needs no rebuild. Runs during
    // SSR too, so the served HTML (and crawlers) get the right title.
    inject(Title).setTitle(shopTitle(this.branding));
    // The language the text is written in, from the same config and for the
    // same reason: a screen reader picks its voice by it, and a browser its
    // hyphenation and spell-checking.
    const root = inject(DOCUMENT).documentElement;
    root.lang = inject(DEPLOYMENT_CONFIG).locale;
    // The theme goes on <html> rather than on this component: the confirm
    // dialog is appended to <body>, outside it, and has to be drawn in the
    // same colours. Property by property, because <html> also carries the
    // cart's figures, which the pre-paint script set before this runs.
    for (const [name, value] of themeProperties(this.branding)) {
      root.style.setProperty(name, value);
    }

    // Starts recording which listing the visitor is standing at, so leaving
    // the cart returns to the shelf rather than to the front of the shop.
    inject(LastListingService);

    // Starts keeping the navbar cart's figures on <html>, where both navbars
    // and the pre-paint script read them from.
    inject(CartFigures);
  }
}

/**
 * The custom properties a deployment's branding overrides, the ones it leaves
 * out keeping the stylesheet's own. A theme key is the role of the same name
 * (`surfaceStrong` is `--color-surface-strong`), a status colour's keys its
 * roles (`danger.edgeStrong` is `--color-danger-edge-strong`, `base` the bare
 * name).
 */
function themeProperties(
  branding: DeploymentConfig['branding'],
): [string, string][] {
  const kebab = (key: string) =>
    key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  const properties: [string, string][] = [];
  for (const [key, value] of Object.entries(branding.theme)) {
    if (typeof value === 'string') {
      if (value !== '') properties.push([`--color-${kebab(key)}`, value]);
    } else if (value) {
      for (const [role, colour] of Object.entries(value)) {
        const suffix = role === 'base' ? '' : `-${kebab(role)}`;
        properties.push([`--color-${key}${suffix}`, colour]);
      }
    }
  }
  // Not a colour, but the same seam: one custom property a deployment may
  // override without a rebuild (see libs/ui/src/ui.css).
  const emphasis = branding.font?.emphasisWeight;
  if (emphasis !== undefined) {
    properties.push(['--font-weight-emphasis', String(emphasis)]);
  }
  return properties;
}
