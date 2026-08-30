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
import { CartLink } from './cart-link';
import { CatalogLink } from './catalog-link';
import { HeaderCollapse } from './header-collapse';
import { ContactInfo } from './contact-info';
import { NAV_ACTION } from './nav-action';
import { SearchField } from './search-field';
import { Icon } from '../ui/icons/icon';

/**
 * Two-row header, the conventional B2B/e-commerce split: a slim utility bar
 * (company pages + contact details) above a main bar that carries the brand
 * and the primary actions — search, the catalogue, the cart and the account.
 *
 * On mobile there is no room for two rows: the utility bar is hidden and its
 * links and contact details move into the hamburger panel, while search
 * collapses to an icon that expands into a row of its own. Only one of the two
 * panels is ever opened by hand — the search row is also permanently open on
 * the results page, where the field belongs to the page rather than to the
 * chrome.
 */
@Component({
  imports: [
    RouterLink,
    RouterLinkActive,
    AccountLink,
    CartLink,
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
          class="mx-auto flex h-10 w-full max-w-[82rem] items-center justify-between gap-6 px-4"
        >
          <nav class="flex gap-4 text-sm" [attr.aria-label]="a11y.utilityNav">
            @for (route of utilityRoutes; track route) {
              <a
                [routerLink]="'/' + route"
                routerLinkActive
                ariaCurrentWhenActive="page"
                [attr.data-label]="text.nav[route]"
                class="text-stable text-subtle transition-colors hover:text-accent active:text-secondary aria-[current=page]:font-medium aria-[current=page]:text-primary"
              >
                {{ text.nav[route] }}
              </a>
            }
          </nav>
          @if (contact?.phone || contact?.email) {
            <app-contact-info class="pr-1" />
          }
        </div>
      </div>

      <div
        class="mx-auto flex h-15 w-full max-w-[82rem] items-center justify-between px-4"
      >
        <a routerLink="/" [attr.aria-label]="homeLabel" (click)="closePanels()">
          <!-- Plain <img>: NgOptimizedImage adds nothing for a local SVG.
               Both dimensions come from the deployment's config rather than
               being written here, because the asset they describe is the
               deployment's too. They are never the drawn size — CSS sets the
               height and the width follows — only the ratio the browser needs
               to keep the space before the file arrives. -->
          <img
            src="logo.svg"
            alt=""
            [width]="logo.width"
            [height]="logo.height"
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
          <!-- Reaching for any of these is a decision to go somewhere else, so
               whichever panel is open has been abandoned. Bound on the host
               element of each control rather than inside it: the link they
               each draw is the interactive thing, and its click bubbles. -->
          <app-catalog-link (click)="closePanels()" />
          <app-cart-link (click)="closePanels()" />
          <app-account-link (click)="closePanels()" />
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
              [class]="
                menuRow +
                ' aria-[current=page]:font-medium aria-[current=page]:text-primary'
              "
              (click)="closePanels()"
            >
              {{ text.nav[route] }}
            </a>
          }
          <!-- The contact details close the panel: on desktop they sit in the
               utility bar, and this is the only place a phone viewport has
               room for them. -->
          @if (contact?.phone; as phone) {
            <a
              [href]="telHref(phone)"
              [class]="menuRow"
              (click)="closePanels()"
            >
              <app-icon name="phone" class="h-4 w-4" />
              {{ phone }}
            </a>
          }
          @if (contact?.email; as email) {
            <a
              [href]="'mailto:' + email"
              [class]="menuRow"
              (click)="closePanels()"
            >
              <app-icon name="mail" class="h-4 w-4" />
              {{ email }}
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
  private readonly headerCollapse = inject(HeaderCollapse);
  protected readonly collapsed = this.headerCollapse.collapsed;

  protected readonly text = inject(APP_TEXT);
  protected readonly branding = this.config.branding;
  protected readonly logo = this.branding.logo;
  protected readonly contact = this.config.contact;
  protected readonly navAction = NAV_ACTION;
  /** One row of the mobile panel — page links and contact details alike. */
  protected readonly menuRow =
    'flex items-center gap-2 px-4 py-3 text-muted transition-colors hover:bg-stone-100 active:text-secondary';
  protected readonly a11y = this.text.a11y;
  protected readonly search = this.text.search;
  protected readonly homeLabel = this.text.a11y.homeLink.replace(
    '{name}',
    this.config.branding.name,
  );
  /** Which company pages sit in the utility bar, and in what order. */
  protected readonly utilityRoutes = this.config.pages.headerNav;

  // The rule itself lives in HeaderCollapse, which the footer's back-to-top
  // button reads too; the header is only what listens. Never fires on the
  // server.
  @HostListener('window:scroll')
  protected onScroll(): void {
    this.headerCollapse.update(window.scrollY);
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

  /** Both panels away, for anything in the navbar that is a departure rather
   * than a second panel. Never touches the results page's permanent search row,
   * which `searchOpen` decides on its own. */
  protected closePanels(): void {
    this.menuOpen.set(false);
    this.searchToggled.set(false);
  }

  /** tel: for the mobile panel's call row; dial characters only. */
  protected telHref(phone: string): string {
    return 'tel:' + phone.replace(/[^\d+]/g, '');
  }
}
