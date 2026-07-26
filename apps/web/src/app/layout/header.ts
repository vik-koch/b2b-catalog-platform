import {
  Component,
  ElementRef,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { CloseIcon } from '../ui/icons/close-icon';
import { MenuIcon } from '../ui/icons/menu-icon';
import { PhoneIcon } from '../ui/icons/phone-icon';
import { AccountLink } from './account-link';
import { ContactInfo } from './contact-info';
import { NAV_ACTION } from './nav-action';

/**
 * Two-row header, the conventional B2B/e-commerce split: a slim utility bar
 * (company pages + contact details) above a main bar that carries the brand
 * and the primary actions — the account link today, search and cart later.
 *
 * On mobile there is no room for two rows: the utility bar is hidden, its
 * links move into the hamburger panel, and the phone becomes a one-tap icon
 * next to the account link.
 */
@Component({
  imports: [
    RouterLink,
    RouterLinkActive,
    AccountLink,
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
      <!-- Utility bar; collapses on scroll so only the main bar keeps sticking.
           Everything in it is reachable from the footer and the mobile panel
           too, which is what makes collapsing it safe. -->
      <div
        class="hidden overflow-hidden transition-all duration-300 md:block"
        [class.max-h-0]="collapsed()"
        [class.opacity-0]="collapsed()"
        [class.max-h-12]="!collapsed()"
      >
        <div
          class="mx-auto flex h-10 w-full max-w-5xl items-center justify-between gap-6 px-4"
        >
          <nav class="flex gap-5 text-sm" aria-label="Utility">
            @for (route of utilityRoutes; track route) {
              <a
                [routerLink]="'/' + route"
                routerLinkActive
                ariaCurrentWhenActive="page"
                class="text-stone-500 transition-colors hover:text-accent aria-[current=page]:font-medium aria-[current=page]:text-primary"
              >
                {{ text.nav[route] }}
              </a>
            }
          </nav>
          @if (contact?.phone || contact?.email) {
            <app-contact-info variant="plain" />
          }
        </div>
      </div>

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
            src="logo.svg"
            alt=""
            width="180"
            height="40"
            class="h-8 w-auto"
          />
        </a>

        <!-- Primary actions. Search and cart join the account link here. -->
        <div class="flex items-center gap-1">
          @if (contact?.phone; as phone) {
            <!-- One-tap call, mobile only — on desktop the number is spelled
                 out in the utility bar, so this label is never visible. -->
            <a [href]="telHref(phone)" [class]="navAction + ' md:hidden'">
              <app-icon-phone class="h-6 w-6" />
              <span class="sr-only">Call {{ phone }}</span>
            </a>
          }
          <app-account-link />
          <button
            type="button"
            [class]="navAction + ' -mr-2 md:hidden'"
            [attr.aria-expanded]="menuOpen()"
            aria-controls="mobile-menu"
            (click)="menuOpen.set(!menuOpen())"
          >
            @if (menuOpen()) {
              <app-icon-close class="h-6 w-6" />
            } @else {
              <app-icon-menu class="h-6 w-6" />
            }
            <span class="sr-only">Toggle menu</span>
          </button>
        </div>
      </div>

      @if (menuOpen()) {
        <nav
          id="mobile-menu"
          class="border-t border-stone-200 md:hidden"
          aria-label="Utility"
        >
          @for (route of utilityRoutes; track route) {
            <a
              [routerLink]="'/' + route"
              routerLinkActive
              ariaCurrentWhenActive="page"
              class="block px-4 py-3 text-stone-600 hover:bg-stone-100 aria-[current=page]:font-medium aria-[current=page]:text-primary"
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
  private readonly host = inject(ElementRef<HTMLElement>);

  menuOpen = signal(false);
  protected readonly collapsed = signal(false);

  protected readonly text = inject(APP_TEXT);
  protected readonly branding = this.config.branding;
  protected readonly contact = this.config.contact;
  protected readonly navAction = NAV_ACTION;
  protected readonly utilityRoutes: readonly string[] = ['about', 'contact'];

  // Collapse the utility bar once scrolled off the top. Never fires on the
  // server; the initial render is expanded and matches hydration.
  @HostListener('window:scroll')
  protected onScroll(): void {
    const currentScroll = window.scrollY;
    if (!this.collapsed() && currentScroll > 16) {
      this.collapsed.set(true);
    } else if (this.collapsed() && currentScroll < 4) {
      this.collapsed.set(false);
    }
  }

  // The mobile panel is the header's only overlay now that the account popup is
  // gone, so it takes over the dismissal behaviour the popup had. Neither
  // listener ever fires on the server.
  @HostListener('document:click', ['$event.target'])
  protected onDocumentClick(target: EventTarget | null): void {
    if (target instanceof Node && !this.host.nativeElement.contains(target)) {
      this.menuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.menuOpen.set(false);
  }

  /** tel: for the mobile call icon; dial characters only. */
  protected telHref(phone: string): string {
    return 'tel:' + phone.replace(/[^\d+]/g, '');
  }
}
