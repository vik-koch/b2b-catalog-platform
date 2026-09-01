import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { DEPLOYMENT_CONFIG } from './config/deployment-config';
import { CartFigures } from './cart/cart-figures';
import { LastListingService } from './catalog/last-listing.service';
import { CookieConsent } from './consent/cookie-consent';
import { ForcePasswordChange } from './auth/force-password-change';
import { Footer } from './layout/footer';
import { Header } from './layout/header';
import { EditModeToggle } from './admin/edit-mode-toggle';

@Component({
  imports: [
    RouterOutlet,
    Header,
    Footer,
    CookieConsent,
    ForcePasswordChange,
    EditModeToggle,
  ],
  selector: 'app-root',
  template: `
    <!-- Stone behind the signed-out screens, so the white card the auth pages
         draw has something to sit on; the ordinary page background otherwise.
         Bound rather than toggled with a second class: two background
         utilities on one element would be decided by stylesheet order. -->
    <div class="flex min-h-dvh flex-col text-ink" [class]="pageBackground()">
      <app-header />
      <!-- The wide frame, and one of only two page widths. Anything
           multi-column — catalog grids, admin tables, dashboards — fills it;
           a single-column form or reading column takes max-w-xl inside it.
           Those narrow columns are centered only on the signed-out screens
           (login, register, password reset), where the page is the whole task;
           inside the app they stay left, under a left-aligned heading. -->
      <main class="mx-auto w-full max-w-[82rem] flex-1 px-4 py-6">
        <router-outlet />
      </main>
      <!-- No top border where the page behind it is already stone: the line
           would divide two areas of the same colour. -->
      <app-footer [seamless]="centered()" />
    </div>
    <app-cookie-consent />
    <!-- Renders nothing unless a signed-in account still owes a password
         change, so public pages carry only the (empty) component instance. -->
    <app-force-password-change />
    <!-- Admin-only storefront edit-mode toggle; empty for everyone else. -->
    <app-edit-mode-toggle />
  `,
  host: {
    '[style.--color-primary]': 'branding.theme.primary',
    '[style.--color-secondary]': 'branding.theme.secondary',
    '[style.--color-accent]': 'branding.theme.accent',
    '[style.--color-surface]': 'branding.theme.surface || null',
    '[style.--color-ink]': 'branding.theme.ink || null',
    '[style.--color-muted]': 'branding.theme.muted || null',
    '[style.--color-subtle]': 'branding.theme.subtle || null',
    '[style.--color-border]': 'branding.theme.border || null',
    '[style.--color-border-strong]': 'branding.theme.borderStrong || null',
  },
})
export class App {
  protected branding = inject(DEPLOYMENT_CONFIG).branding;
  private readonly router = inject(Router);

  /**
   * Whether the active route asked for the signed-out treatment. Seeded from
   * the router's own snapshot rather than waiting for a navigation event, so
   * the first render already has it — a page that arrived white and turned
   * stone would flash.
   */
  protected readonly centered = signal(this.isCenteredRoute());

  /** Stone behind the auth card, the ordinary page background otherwise. */
  protected readonly pageBackground = computed(() =>
    this.centered() ? 'bg-stone-100' : 'bg-surface',
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
    inject(Title).setTitle(this.branding.title);

    // Starts recording which listing the visitor is standing at, so leaving
    // the cart returns to the shelf rather than to the front of the shop.
    inject(LastListingService);

    // Starts keeping the navbar cart's figures on <html>, where both navbars
    // and the pre-paint script read them from.
    inject(CartFigures);
  }
}
