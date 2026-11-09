import {
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { mailIcon } from '@b2b-catalog-platform/ui/icons/glyphs/mail';
import { menuIcon } from '@b2b-catalog-platform/ui/icons/glyphs/menu';
import { phoneIcon } from '@b2b-catalog-platform/ui/icons/glyphs/phone';
import { searchIcon } from '@b2b-catalog-platform/ui/icons/glyphs/search';
import { xIcon } from '@b2b-catalog-platform/ui/icons/glyphs/x';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';

import { SITE_CONFIG } from '../../core/site/site-config';
import { AuthService } from '../../platform/auth/auth.service';
import { DEPLOYMENT_CONFIG } from '../../platform/config/deployment-config';
import { SHARED_TEXT } from '../../platform/config/shared-text';
import { STOREFRONT_TEXT } from '../../platform/config/storefront-text';
import { currentPath } from '../../platform/current-url';
import { STOREFRONT_CATALOG_TEXT } from '../catalog/catalog-text';
import { CartLink } from '../ordering/cart/cart-link';
import { STOREFRONT_ORDERING_TEXT } from '../ordering/ordering-text';
import { MobileSearch } from '../platform/mobile-search';
import { navActionClasses, TAB_CURRENT } from '../platform/nav-action';
import { AccountLink } from './account-link';
import { CatalogLink } from './catalog-link';
import { mailHref, telHref } from './contact-info';
import { withExitAnimation } from './leave-animation';

/**
 * The phone's navigation below `sm`, keeping the cart in view for the whole
 * visit. Five tabs for everybody, as one appearing on sign-in would move the
 * others under a learned thumb; what a session adds goes in the panel. Search
 * is a tab so the header can scroll away (see MobileSearch).
 */
@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, AccountLink, CartLink, CatalogLink, Icon],
  host: { class: 'sm:hidden' },
  // The browser's grey flash would land on the press tint; inherited.
  styles: `
    :host {
      -webkit-tap-highlight-color: transparent;
    }
  `,
  template: `
    <!-- Not inside the header: its backdrop-filter would anchor a fixed
         descendant to itself. -->
    <nav
      class="fixed inset-x-0 bottom-0 z-30"
      [attr.aria-label]="a11y.primaryNav"
    >
      <!-- Above the bar, which stays put, rising out of it and sinking back. -->
      @if (menuShown()) {
        <nav
          id="more-menu"
          [attr.aria-label]="a11y.utilityNav"
          [class]="panelClasses()"
        >
          <!-- Home leads, as the wordmark scrolls away with the header. -->
          <a
            routerLink="/"
            [attr.aria-current]="isCurrent('/') ? 'page' : null"
            [class]="menuRow"
            (click)="close()"
          >
            {{ nav['home'] }}
          </a>
          @for (route of menuRoutes; track route) {
            <a
              [routerLink]="'/' + route"
              [attr.aria-current]="isCurrent('/' + route) ? 'page' : null"
              [class]="menuRow"
              (click)="close()"
            >
              {{ nav[route] }}
            </a>
          }
          <!-- A customer's own; staff's are in the admin panel. -->
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
          @if (contact?.phone; as phone) {
            <a [href]="telHref(phone)" [class]="menuRow" (click)="close()">
              <ui-icon [glyph]="phoneIcon" class="size-4" />
              {{ phone }}
            </a>
          }
          @if (contact?.email; as email) {
            <a [href]="mailHref(email)" [class]="menuRow" (click)="close()">
              <ui-icon [glyph]="mailIcon" class="size-4" />
              {{ email }}
            </a>
          }
        </nav>
      }

      <!-- Its own surface beside the panel, so each blurs the page; "relative"
           paints it over the panel. The height is here, so the shell's
           reserve under the page is the same number. -->
      <div
        class="relative border-t border-edge bg-surface-subtle/85
               backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
      >
        <div class="flex h-14 items-stretch px-1">
          <!-- A tab closes the panel; the host is a flex item that hands its
               control the share. -->
          <app-catalog-link
            variant="tab"
            class="flex flex-1"
            (click)="close()"
          />
          <!-- Lit while searching; not aria-current, as it goes nowhere. -->
          <button
            type="button"
            [class]="searchClasses()"
            (click)="openSearch()"
          >
            <ui-icon [glyph]="searchIcon" class="size-6" />
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
          <!-- Open, it carries the current tab's tint. -->
          <button
            type="button"
            [class]="moreClasses()"
            [attr.aria-expanded]="menuOpen()"
            aria-controls="more-menu"
            (click)="toggle()"
          >
            @if (menuOpen()) {
              <ui-icon [glyph]="xIcon" class="size-6" />
            } @else {
              <ui-icon [glyph]="menuIcon" class="size-6" />
            }
            <span [class]="tab.labelRow">
              <span [class]="tab.label">{{ nav['more'] }}</span>
            </span>
          </button>
        </div>
      </div>
    </nav>
  `,
})
export class BottomNav {
  protected readonly mailIcon = mailIcon;
  protected readonly menuIcon = menuIcon;
  protected readonly phoneIcon = phoneIcon;
  protected readonly searchIcon = searchIcon;
  protected readonly xIcon = xIcon;
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly siteConfig = inject(SITE_CONFIG);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly auth = inject(AuthService);
  private readonly mobileSearch = inject(MobileSearch);
  private readonly path = currentPath();

  protected readonly menuOpen = signal(false);
  private readonly exit = withExitAnimation(this.menuOpen);
  protected readonly menuShown = this.exit.shown;

  /** `-mb-px`: at a fractional pixel ratio the two boxes round apart. */
  private readonly panel = `absolute inset-x-0 bottom-full -mb-px
                            max-h-[60dvh] overflow-y-auto border-t border-edge
                            bg-surface-subtle/85 backdrop-blur
                            shadow-[0_-4px_16px_rgba(0,0,0,0.08)]
                            motion-reduce:animate-none`;
  protected readonly panelClasses = computed(
    () =>
      `${this.panel} ${this.exit.leaving() ? 'animate-menu-sink' : 'animate-menu-rise'}`,
  );

  protected readonly text = inject(STOREFRONT_TEXT);
  protected readonly nav = inject(SHARED_TEXT).nav;
  protected readonly orders = inject(STOREFRONT_ORDERING_TEXT).orders;
  protected readonly search = inject(STOREFRONT_CATALOG_TEXT).search;
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
  /** In the header's order. */
  protected readonly menuRoutes = this.siteConfig.pages.headerNav;

  protected readonly menuRow = `flex items-center gap-2 px-4 py-3
                                text-ink-subtle transition-colors
                                hover:bg-surface-subtle-hover
                                active:bg-primary/10 active:text-primary-press
                                aria-[current=page]:font-medium
                                aria-[current=page]:text-primary`;

  /** The answer once there is one, the hint until then, as AccountLink. */
  protected readonly isCustomer = computed(() => {
    const role = this.auth.user()?.role ?? this.auth.hintedRole();
    return role === 'user';
  });

  protected isCurrent(route: string): boolean {
    return this.path() === route;
  }

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

  /** Hands the tap to whichever field is reachable (MobileSearch). */
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

  protected readonly telHref = telHref;
  protected readonly mailHref = mailHref;
}
