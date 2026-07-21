import { Component, HostListener, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { CloseIcon } from '../ui/icons/close-icon';
import { MenuIcon } from '../ui/icons/menu-icon';
import { PhoneIcon } from '../ui/icons/phone-icon';
import { ContactInfo } from './contact-info';

@Component({
  imports: [
    RouterLink,
    RouterLinkActive,
    ContactInfo,
    PhoneIcon,
    MenuIcon,
    CloseIcon,
  ],
  // display:contents so the sticky <header> is a direct child of the tall page
  // column — otherwise the host box is only header-height and sticky can't move.
  host: { class: 'contents' },
  selector: 'app-header',
  template: `
    <header
      class="sticky top-0 z-10 border-b border-stone-200 bg-surface/90 backdrop-blur"
    >
      <!-- Desktop utility bar above the nav; collapses on scroll. The nav row
           stays free for future catalog / search / cart / login. On mobile the
           phone moves into the nav row (below) instead. -->
      @if (contact?.phone || contact?.email) {
        <div
          class="hidden overflow-hidden transition-all duration-300 md:block"
          [class.max-h-0]="collapsed()"
          [class.opacity-0]="collapsed()"
          [class.max-h-12]="!collapsed()"
        >
          <div
            class="mx-auto flex h-10 w-full max-w-5xl items-center justify-end border-b border-stone-100 px-4"
          >
            <app-contact-info />
          </div>
        </div>
      }
      <div
        class="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4"
      >
        <a
          routerLink="/"
          [attr.aria-label]="branding.name + ' — home'"
          (click)="menuOpen.set(false)"
        >
          <!-- Plain <img>: NgOptimizedImage adds nothing for a local SVG.
               Intrinsic width/height prevent layout shift; CSS scales it. -->
          <img
            [src]="branding.logo"
            alt=""
            width="180"
            height="40"
            class="h-8 w-auto"
          />
        </a>

        <nav class="hidden gap-6 text-sm md:flex" aria-label="Main">
          @for (route of navRoutes; track route) {
            <a
              [routerLink]="'/' + route"
              routerLinkActive="text-primary font-medium"
              class="text-stone-600 transition-colors hover:text-ink"
            >
              {{ text.nav[route] }}
            </a>
          }
        </nav>

        <!-- Mobile controls: a one-tap call icon (no text) beside the menu. -->
        <div class="flex items-center gap-1 md:hidden">
          @if (contact?.phone; as phone) {
            <a
              [href]="telHref(phone)"
              class="rounded-md p-2 text-primary hover:bg-stone-100"
              [attr.aria-label]="'Call ' + phone"
            >
              <app-icon-phone class="h-5 w-5" />
            </a>
          }
          <button
            type="button"
            class="-mr-2 rounded-md p-2 text-stone-600 hover:bg-stone-100"
            [attr.aria-expanded]="menuOpen()"
            aria-controls="mobile-menu"
            aria-label="Toggle menu"
            (click)="menuOpen.set(!menuOpen())"
          >
            @if (menuOpen()) {
              <app-icon-close class="h-5 w-5" />
            } @else {
              <app-icon-menu class="h-5 w-5" />
            }
          </button>
        </div>
      </div>

      @if (menuOpen()) {
        <nav
          id="mobile-menu"
          class="border-t border-stone-200 md:hidden"
          aria-label="Main"
        >
          @for (route of navRoutes; track route) {
            <a
              [routerLink]="'/' + route"
              routerLinkActive="text-primary font-medium"
              class="block px-4 py-3 text-stone-600 hover:bg-stone-100"
              (click)="menuOpen.set(false)"
            >
              {{ text.nav[route] }}
            </a>
          }
        </nav>
      }
    </header>
  `,
})
export class Header {
  private readonly config = inject(DEPLOYMENT_CONFIG);

  menuOpen = signal(false);
  protected readonly collapsed = signal(false);

  protected readonly text = inject(APP_TEXT);
  protected readonly branding = this.config.branding;
  protected readonly contact = this.config.contact;
  protected readonly navRoutes: readonly string[] = ['about', 'contact'];

  // Collapse the contact bar once scrolled off the top. Never fires on the
  // server; the initial render is expanded and matches hydration.
  @HostListener('window:scroll')
  protected onScroll(): void {
    this.collapsed.set(window.scrollY > 8);
  }

  /** tel: for the mobile call icon; dial characters only. */
  protected telHref(phone: string): string {
    return 'tel:' + phone.replace(/[^\d+]/g, '');
  }
}
