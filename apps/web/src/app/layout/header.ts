import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { currentUrl } from '../core/current-url';
import { AccountLink } from './account-link';
import { CartLink } from './cart-link';
import { CatalogLink } from './catalog-link';
import { ContactInfo } from './contact-info';
import { HeaderCollapse } from './header-collapse';
import { MobileSearch, SearchAnchor } from './mobile-search';
import { SearchField } from './search-field';

/**
 * Two-row header, the conventional B2B/e-commerce split: a slim utility bar
 * above a main bar that carries the brand and the primary actions.
 *
 * Which two rows depends on the width. From `sm` the top row is company pages
 * and contact details, and the main bar is brand, search and the actions —
 * search takes the space between them, because it is the primary way into a
 * catalogue this size. Below `sm` the actions move to the bottom bar, the top
 * row becomes the brand and the contact details, and search takes the main bar
 * to itself.
 *
 * **Below `sm` the header does not stick.** It is the page's masthead there
 * and it scrolls away with the page, which leaves the bottom bar as the only
 * permanent chrome on the smallest screens. Search loses nothing by it: the
 * bottom bar's search tab scrolls this field back into view while any of it is
 * still showing, and opens the same field over the page once it is not.
 *
 * The exception is the results page, where the field carries the query being
 * viewed and is the one thing a visitor came to adjust. There it sticks at
 * every width, and the brand row above it slides away on scroll the way the
 * utility bar does on desktop.
 */
@Component({
  imports: [
    RouterLink,
    RouterLinkActive,
    AccountLink,
    CartLink,
    CatalogLink,
    ContactInfo,
    SearchField,
  ],
  // display:contents so the sticky <header> is a direct child of the tall page
  // column — otherwise the host box is only header-height and sticky can't move.
  host: { class: 'contents' },
  selector: 'app-header',
  template: `
    <!-- Collapsing slides the whole header up by the top row's height rather
         than shrinking it. Its box in the layout therefore always reserves
         both rows, so the page content below never moves: collapsed, the freed
         strip simply sits empty above the main bar, and expanding slides the
         header back down over it. Transform only — no reflow. It only ever
         happens where the header sticks, and the distance is the height of the
         row being hidden — which is the same 40px either way, the phone's
         brand row on the results page and the utility bar from "sm". -->
    <header
      class="z-20 border-b border-border bg-surface/85 backdrop-blur transition-transform duration-300 sm:sticky sm:top-0"
      [class]="headerClasses()"
    >
      <!-- The phone's top row. Everything in it is reachable further down the
           page or from the bottom bar's panel, which is what makes hiding it
           on scroll safe. -->
      <div
        class="flex mt-2 h-8 w-full items-center justify-between gap-4 px-4 sm:hidden"
      >
        <a [routerLink]="'/'" [attr.aria-label]="homeLabel" class="shrink-0">
          <img
            src="logo.svg"
            alt=""
            [width]="logo.width"
            [height]="logo.height"
            class="h-8 w-auto transition-opacity hover:opacity-75"
          />
        </a>
        <app-contact-info class="-mr-2 min-w-0 flex-1 justify-end" />
      </div>

      <!-- The utility bar, from "sm". The page links keep their width and the
           contact pills take what is left, which at 640px is not much — the
           address ends in an ellipsis rather than the row losing a channel. -->
      <div class="hidden sm:block">
        <div
          class="mx-auto flex mt-2 h-8 w-full max-w-[82rem] items-center justify-between gap-4 px-4"
        >
          <nav
            class="flex shrink-0 gap-4 text-sm"
            [attr.aria-label]="a11y.utilityNav"
          >
            @for (route of utilityRoutes; track route) {
              <a
                [routerLink]="'/' + route"
                routerLinkActive
                ariaCurrentWhenActive="page"
                [attr.data-label]="text.nav[route]"
                class="text-stable text-center text-subtle transition-colors hover:text-accent active:text-primary-deep aria-[current=page]:font-medium aria-[current=page]:text-primary"
              >
                {{ text.nav[route] }}
              </a>
            }
          </nav>
          @if (contact?.phone || contact?.email) {
            <app-contact-info class="min-w-0 flex-1 justify-end pr-1" />
          }
        </div>
      </div>

      <!-- The main bar. On a phone it is the search field and nothing else. -->
      <div
        #searchRow
        class="mx-auto flex h-15 w-full max-w-[82rem] items-center justify-between px-4"
      >
        <!-- Plain <img>: NgOptimizedImage adds nothing for a local SVG.
             Both dimensions come from the deployment's config rather than
             being written here, because the asset they describe is the
             deployment's too. They are never the drawn size — CSS sets the
             height and the width follows — only the ratio the browser needs
             to keep the space before the file arrives. -->
        <a
          [routerLink]="'/'"
          [attr.aria-label]="homeLabel"
          class="hidden sm:block"
        >
          <img
            src="logo.svg"
            alt=""
            [width]="logo.width"
            [height]="logo.height"
            class="h-10 w-auto pr-3 transition-opacity hover:opacity-75"
          />
        </a>

        <app-search-field #field class="min-w-0 flex-1 sm:mx-3" />

        <!-- The primary actions, from "sm". Below it the same three controls
             are drawn by the bottom bar; only one of the two groups is ever in
             the document, so nothing is announced twice. -->
        <div class="hidden items-center sm:flex">
          <app-catalog-link />
          <app-cart-link />
          <app-account-link />
        </div>
      </div>
    </header>
  `,
})
export class Header {
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly url = currentUrl();

  private readonly headerCollapse = inject(HeaderCollapse);
  protected readonly collapsed = this.headerCollapse.collapsed;

  /** On the results page the field is the page's own control, not an optional
   * extra: it carries the query that produced the results and is where a
   * refinement gets typed, so it stays on screen at every width. */
  private readonly onSearchPage = computed(
    () => this.url().split(/[?#]/)[0] === '/search',
  );

  protected readonly headerClasses = computed(() => {
    const sticky = this.onSearchPage() ? 'sticky top-0' : '';
    if (!this.collapsed()) return sticky;
    const brandRow = this.onSearchPage() ? '-translate-y-10 ' : '';
    return `${sticky} ${brandRow}sm:-translate-y-10`;
  });

  protected readonly text = inject(APP_TEXT);
  protected readonly branding = this.config.branding;
  protected readonly logo = this.branding.logo;
  protected readonly contact = this.config.contact;
  protected readonly a11y = this.text.a11y;
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

  private readonly searchRow =
    viewChild.required<ElementRef<HTMLElement>>('searchRow');
  private readonly field = viewChild.required<SearchField>('field');

  constructor() {
    const mobileSearch = inject(MobileSearch);
    const destroyRef = inject(DestroyRef);

    // Lent to the bottom bar's search tab for as long as this header is on the
    // page, so a tap down there can answer with the field up here.
    afterNextRender(() => {
      const anchor: SearchAnchor = {
        row: this.searchRow().nativeElement,
        focus: () => this.field().focus(),
      };
      mobileSearch.register(anchor);
      destroyRef.onDestroy(() => mobileSearch.release(anchor));
    });
  }
}
