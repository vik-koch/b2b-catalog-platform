import {
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { currentUrl } from '../core/current-url';
import { Icon } from '../ui/icons/icon';
import { AccountLink } from './account-link';
import { CartLink } from './cart-link';
import { CatalogLink } from './catalog-link';
import { withExitAnimation } from './leave-animation';
import { MobileSearch } from './mobile-search';
import { navActionClasses, TAB_CURRENT } from './nav-action';

/** Must match the exit animation in styles.css. */
const LEAVE_MS = 150;

/**
 * The phone's primary navigation: a fixed bar along the bottom edge, below
 * `sm`. It exists so the header above it can be brand, contact and a search
 * field rather than a row of glyphs competing with all three — and it keeps
 * the cart's badge on screen for the whole visit, which is the one thing a
 * shop wants a customer never to have to look for.
 *
 * Five glyphs, evenly divided, with the cart in the middle. All five are there
 * for everybody: a tab that appears on sign-in would shift every other tab
 * under the thumb that had learned where they were, so what a session adds
 * (the order history) goes in the panel instead, where appearing costs
 * nothing.
 *
 * Search is a tab rather than a bar in the header, which is what lets the
 * header scroll away with the page — see MobileSearch for what the tap does
 * with the field it finds. Home is not a tab: the wordmark at the top of the
 * page is the way home, and the shelf is where a customer of a catalogue this
 * size actually returns to.
 *
 * The three action controls are the same components the header draws — one
 * shape each, chosen by `variant`. Both groups are always in the document and
 * the unused one is `display:none`, so only one is ever in the accessibility
 * tree.
 */
@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, AccountLink, CartLink, CatalogLink, Icon],
  host: { class: 'sm:hidden' },
  // The browser's own grey flash would land on top of the tabs' press tint,
  // a beat later and in a colour the app does not own. Inherited, so this one
  // declaration covers the bar and the panel above it.
  styles: `
    :host {
      -webkit-tap-highlight-color: transparent;
    }
  `,
  template: `
    <!-- Fixed, and deliberately not a descendant of the header: a
         backdrop-filter makes an element the containing block for its fixed
         descendants, so a bar nested in the blurred header would anchor to the
         header rather than to the viewport. -->
    <nav
      class="fixed inset-x-0 bottom-0 z-30"
      [attr.aria-label]="a11y.primaryNav"
    >
      <!-- The panel rides above the bar rather than beside it, so the bar it
           was opened from stays put and stays visible. Absolute inside the
           fixed bar, which puts it above the safe-area padding too, and it
           rises out of that bar and sinks back into it. Translucent over a
           blur, as the header's own bars are: what is behind it is the page it
           belongs to, not a separate surface. -->
      @if (menuShown()) {
        <nav
          id="more-menu"
          [attr.aria-label]="a11y.utilityNav"
          [class]="panelClasses()"
        >
          <!-- Home leads the panel: the wordmark is the way home and the
               wordmark scrolls away with the header, so this is where home is
               reachable from the rest of the page. -->
          <a
            routerLink="/"
            [attr.aria-current]="isCurrent('/') ? 'page' : null"
            [class]="menuRow"
            (click)="close()"
          >
            {{ text.nav['home'] }}
          </a>
          @for (route of menuRoutes; track route) {
            <a
              [routerLink]="'/' + route"
              [attr.aria-current]="isCurrent('/' + route) ? 'page' : null"
              [class]="menuRow"
              (click)="close()"
            >
              {{ text.nav[route] }}
            </a>
          }
          <!-- What a session adds. Staff order histories are their own list in
               the admin panel, so this is the customer's own. -->
          @if (isCustomer()) {
            <a
              routerLink="/account/orders"
              [attr.aria-current]="isCurrent('/account/orders') ? 'page' : null"
              [class]="menuRow"
              (click)="close()"
            >
              {{ orders.heading }}
            </a>
          }
          <!-- The contact details. The header shows one channel beside the
               wordmark; this is where the other one lives on a phone. -->
          @if (contact?.phone; as phone) {
            <a [href]="telHref(phone)" [class]="menuRow" (click)="close()">
              <app-icon name="phone" class="h-4 w-4" />
              {{ phone }}
            </a>
          }
          @if (contact?.email; as email) {
            <a [href]="'mailto:' + email" [class]="menuRow" (click)="close()">
              <app-icon name="mail" class="h-4 w-4" />
              {{ email }}
            </a>
          }
        </nav>
      }

      <!-- The bar carries its own surface rather than the <nav> doing it, for
           two reasons that both bite the panel above. A backdrop-filter
           isolates the backdrop for everything inside it, so a panel nested
           under a blurred <nav> would have nothing of the page left to blur;
           as siblings, each blurs the page for itself. And "relative" puts the
           bar back above the panel in paint order — a positioned element
           otherwise paints over a static one whatever the document order says
           — so the panel rises from the bar's top edge instead of sliding
           across it from the bottom of the screen.

           The row's height is set here rather than by the tabs' padding, so
           the reserve the shell leaves under the page can be written as the
           same number. -->
      <div
        class="relative border-t border-border bg-surface/85 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      >
        <div class="flex h-14 items-stretch px-1">
          <!-- Reaching for any of these is a decision to go somewhere else, so
               the panel, if it is open, has been abandoned. Bound on the host
               element of each control rather than inside it: the link they each
               draw is the interactive thing, and its click bubbles.

               The share of the width is claimed by the control inside, so its
               host has to be a flex item of this row and hand the share on;
               without that the three of them shrink to their glyphs and the row
               bunches around the cart. -->
          <app-catalog-link
            variant="tab"
            class="flex flex-1"
            (click)="close()"
          />
          <!-- Lit for as long as the field it opens is the thing being
               answered, whether that is the overlay or the header's own field.
               Not aria-current: the tab goes nowhere. -->
          <button
            type="button"
            [class]="searchClasses()"
            (click)="openSearch()"
          >
            <app-icon name="search" class="h-6 w-6" />
            <span [class]="tab.labelRow">
              <span [class]="tab.label">{{ search.openSearch }}</span>
            </span>
          </button>
          <app-cart-link variant="tab" class="flex flex-1" (click)="close()" />
          <app-account-link
            variant="tab"
            class="flex flex-1"
            (click)="close()"
          />
          <!-- Open, the button carries the current tab's own tint: the panel
               is where you are, and it is what the next tap closes. -->
          <button
            type="button"
            [class]="moreClasses()"
            [attr.aria-expanded]="menuOpen()"
            aria-controls="more-menu"
            (click)="toggle()"
          >
            @if (menuOpen()) {
              <app-icon name="close" class="h-6 w-6" />
            } @else {
              <app-icon name="menu" class="h-6 w-6" />
            }
            <span [class]="tab.labelRow">
              <span [class]="tab.label">{{ text.nav['more'] }}</span>
            </span>
          </button>
        </div>
      </div>
    </nav>
  `,
})
export class BottomNav {
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly auth = inject(AuthService);
  private readonly mobileSearch = inject(MobileSearch);
  private readonly url = currentUrl();

  protected readonly menuOpen = signal(false);
  /** In the document while open, and for as long as it takes to leave. */
  private readonly exit = withExitAnimation(this.menuOpen, LEAVE_MS);
  protected readonly menuShown = this.exit.shown;

  private readonly panel =
    'absolute inset-x-0 bottom-full max-h-[60dvh] overflow-y-auto border-t border-border bg-surface/85 backdrop-blur shadow-[0_-4px_16px_rgba(0,0,0,0.08)] motion-reduce:animate-none';
  protected readonly panelClasses = computed(
    () =>
      `${this.panel} ${this.exit.leaving() ? 'animate-menu-sink' : 'animate-menu-rise'}`,
  );

  protected readonly text = inject(APP_TEXT);
  protected readonly orders = this.text.orders;
  protected readonly search = this.text.search;
  protected readonly a11y = this.text.a11y;
  protected readonly contact = this.config.contact;
  protected readonly tab = navActionClasses('tab');
  protected readonly moreClasses = computed(() =>
    this.tabButton(this.menuOpen()),
  );
  protected readonly searchClasses = computed(() =>
    this.tabButton(this.mobileSearch.active()),
  );

  /** A tab that is a state of this bar rather than a route. */
  private tabButton(current: boolean): string {
    return `${this.tab.action} cursor-pointer${current ? ` ${TAB_CURRENT}` : ''}`;
  }
  /** The company pages, in the order the deployment lists them for the header. */
  protected readonly menuRoutes = this.config.pages.headerNav;
  /** One row of the panel — page links and contact details alike. */
  protected readonly menuRow =
    'flex items-center gap-2 px-4 py-3 text-muted transition-colors hover:bg-stone-100 active:bg-primary/10 active:text-primary-deep aria-[current=page]:font-medium aria-[current=page]:text-primary';

  /** Signed in as a customer — the answer once there is one, the browser's own
   * hint until then, exactly as the account control decides its destination. */
  protected readonly isCustomer = computed(() => {
    const role = this.auth.user()?.role ?? this.auth.hintedRole();
    return role === 'user';
  });

  private readonly path = computed(() => this.url().split(/[?#]/)[0]);

  protected isCurrent(route: string): boolean {
    return this.path() === route;
  }

  // The panel is an overlay over a row of destinations, so it dismisses the
  // way the header's did. Neither listener ever fires on the server.
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

  /** Hands the tap to whichever field is reachable — see MobileSearch. */
  protected openSearch(): void {
    this.close();
    this.mobileSearch.activate();
  }

  protected toggle(): void {
    this.menuOpen.update((open) => !open);
  }

  protected close(): void {
    this.menuOpen.set(false);
  }

  /** tel: for the panel's call row; dial characters only. */
  protected telHref(phone: string): string {
    return 'tel:' + phone.replace(/[^\d+]/g, '');
  }
}
