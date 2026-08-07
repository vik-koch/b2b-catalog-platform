import {
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { currentUrl } from '../core/current-url';
import { AccountLink } from './account-link';
import { CatalogLink } from './catalog-link';
import { ContactInfo } from './contact-info';
import { NAV_ACTION } from './nav-action';
import { SearchField } from './search-field';
import { Icon } from '../ui/icons/icon';

/**
 * Two-row header, the conventional B2B/e-commerce split: a slim utility bar
 * (company pages + contact details) above a main bar that carries the brand
 * and the primary actions — search and the account link today, the cart later.
 *
 * On mobile there is no room for two rows: the utility bar is hidden, its
 * links move into the hamburger panel, the phone becomes a one-tap icon next
 * to the account link, and search collapses to an icon that expands into a row
 * of its own. Only one of the two panels is ever opened by hand — the search
 * row is also permanently open on the results page, where the field belongs to
 * the page rather than to the chrome.
 */
@Component({
  imports: [
    RouterLink,
    RouterLinkActive,
    AccountLink,
    CatalogLink,
    ContactInfo,
    Icon,
    SearchField,
  ],
  // display:contents so the sticky <header> is a direct child of the tall page
  // column — otherwise the host box is only header-height and sticky can't move.
  host: { class: 'contents' },
  selector: 'app-header',
  template: `
    <!-- Collapsing slides the whole header up by the utility bar's height
         (h-10) rather than shrinking it. Its box in the layout therefore always
         reserves both rows, so the page content below never moves: collapsed,
         the freed strip simply sits empty above the main bar, and expanding
         slides the header back down over it. Transform only — no reflow. -->
    <header
      class="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur transition-transform duration-300"
      [class]="collapsed() ? 'md:-translate-y-10' : ''"
    >
      <!-- Utility bar; it is what slides out of view. Everything in it is
           reachable from the footer and the mobile panel too, which is what
           makes hiding it safe. -->
      <div class="hidden md:block">
        <div
          class="mx-auto flex h-10 w-full max-w-7xl items-center justify-between gap-6 px-4"
        >
          <nav class="flex gap-5 text-sm" [attr.aria-label]="a11y.utilityNav">
            @for (route of utilityRoutes; track route) {
              <a
                [routerLink]="'/' + route"
                routerLinkActive
                ariaCurrentWhenActive="page"
                [attr.data-label]="text.nav[route]"
                class="text-stable text-subtle transition-colors hover:text-accent aria-[current=page]:font-medium aria-[current=page]:text-primary"
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
        class="mx-auto flex h-15 w-full max-w-7xl items-center justify-between px-4"
      >
        <a
          routerLink="/"
          [attr.aria-label]="homeLabel"
          (click)="menuOpen.set(false)"
        >
          <!-- Plain <img>: NgOptimizedImage adds nothing for a local SVG.
               Intrinsic width/height prevent layout shift; CSS scales it. -->
          <img
            src="logo.svg"
            alt=""
            height="40"
            class="h-10 w-auto pr-3 transition-opacity hover:opacity-75"
          />
        </a>

        <!-- Search takes the space between brand and actions: it is the primary
             way into a catalogue this size, so on desktop it gets the width
             rather than an icon. Narrow screens have no such space, so it
             collapses to the toggle in the action group. -->
        <app-search-field class="mx-3 hidden min-w-0 flex-1 md:block" />

        <!-- Primary actions. Cart joins the account link here. -->
        <div class="flex items-center">
          @if (contact?.phone; as phone) {
            <!-- One-tap call, mobile only — on desktop the number is spelled
                 out in the utility bar, so this label is never visible. -->
            <a [href]="telHref(phone)" [class]="navAction + ' md:hidden'">
              <app-icon name="phone" class="h-6 w-6" />
              <span class="sr-only">{{ callLabel(phone) }}</span>
            </a>
          }
          <!-- Mobile-only counterpart of the inline field above. The glyph
               swaps to a close icon while the row is open, matching the
               hamburger beside it. On the results page the row is permanent,
               so the toggle has nothing left to toggle and is disabled rather
               than removed — the action group keeps its shape as the visitor
               moves on and off the page. -->
          <button
            type="button"
            [class]="
              navAction +
              ' md:hidden disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-primary'
            "
            [disabled]="onSearchPage()"
            [attr.aria-expanded]="searchOpen()"
            aria-controls="mobile-search"
            (click)="toggleSearch()"
          >
            @if (searchOpen()) {
              <app-icon name="close" class="h-6 w-6" />
            } @else {
              <app-icon name="search" class="h-6 w-6" />
            }
            <span class="sr-only">{{
              searchOpen() ? search.closeSearch : search.openSearch
            }}</span>
          </button>
          <app-catalog-link />
          <app-account-link />
          <button
            type="button"
            [class]="navAction + ' -mr-2 md:hidden'"
            [attr.aria-expanded]="menuOpen()"
            aria-controls="mobile-menu"
            (click)="toggleMenu()"
          >
            @if (menuOpen()) {
              <app-icon name="close" class="h-6 w-6" />
            } @else {
              <app-icon name="menu" class="h-6 w-6" />
            }
            <span class="sr-only">{{ a11y.toggleMenu }}</span>
          </button>
        </div>
      </div>

      <!-- The expanded mobile field, as its own row so it gets the full width
           instead of competing with the brand. Rendered only while open, which
           is also what focuses it. It stays open across searches: collapsing it
           on submit would take the field away exactly when a visitor is most
           likely to refine the query they just ran. -->
      @if (searchOpen()) {
        <div
          id="mobile-search"
          class="border-t border-border px-4 py-3 md:hidden"
        >
          <!-- Focus is for the visitor who asked for the field by tapping the
               toggle. On the results page it opens by itself, and grabbing
               focus there would skip past the results they navigated for. -->
          <app-search-field [autoFocus]="!onSearchPage()" />
        </div>
      }

      @if (menuOpen()) {
        <nav
          id="mobile-menu"
          class="border-t border-border md:hidden"
          [attr.aria-label]="a11y.utilityNav"
        >
          @for (route of utilityRoutes; track route) {
            <a
              [routerLink]="'/' + route"
              routerLinkActive
              ariaCurrentWhenActive="page"
              class="block px-4 py-3 text-muted hover:bg-stone-100 aria-[current=page]:font-medium aria-[current=page]:text-primary"
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

  private readonly url = currentUrl();
  /** On the results page the field is the page's own control, not an optional
   * extra: it carries the query that produced the results and is where a
   * refinement gets typed. Collapsing it there would hide the one thing the
   * visitor came to adjust. */
  protected readonly onSearchPage = computed(
    () => this.url().split(/[?#]/)[0] === '/search',
  );
  private readonly searchToggled = signal(false);
  /** Whether the mobile search row is expanded. Desktop renders inline instead. */
  protected readonly searchOpen = computed(
    () => this.onSearchPage() || this.searchToggled(),
  );
  protected readonly collapsed = signal(false);

  protected readonly text = inject(APP_TEXT);
  protected readonly branding = this.config.branding;
  protected readonly contact = this.config.contact;
  protected readonly navAction = NAV_ACTION;
  protected readonly a11y = this.text.a11y;
  protected readonly search = this.text.search;
  protected readonly homeLabel = this.text.a11y.homeLink.replace(
    '{name}',
    this.config.branding.name,
  );
  /** Which company pages sit in the utility bar, and in what order. */
  protected readonly utilityRoutes = this.config.pages.headerNav;

  // Collapse the utility bar once scrolled well off the top, and bring it back
  // only at the very top — mid-page it would slide down over content the reader
  // is looking at. Never fires on the server; the initial render is expanded and
  // matches hydration. Since nothing reflows, neither threshold can feed back
  // into window.scrollY, so no hysteresis gap is needed.
  @HostListener('window:scroll')
  protected onScroll(): void {
    const COLLAPSE_AT = 96;
    const currentScroll = window.scrollY;
    if (!this.collapsed() && currentScroll > COLLAPSE_AT) {
      this.collapsed.set(true);
    } else if (this.collapsed() && currentScroll <= 0) {
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

  /** Opening search closes the menu panel: two rows under a 60px navbar is a
   * lot of chrome, and they answer different intents. */
  protected toggleSearch(): void {
    this.searchToggled.update((open) => !open);
    if (this.searchToggled()) this.menuOpen.set(false);
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
    if (this.menuOpen()) this.searchToggled.set(false);
  }

  protected callLabel(phone: string): string {
    return this.a11y.callPhone.replace('{phone}', phone);
  }

  /** tel: for the mobile call icon; dial characters only. */
  protected telHref(phone: string): string {
    return 'tel:' + phone.replace(/[^\d+]/g, '');
  }
}
