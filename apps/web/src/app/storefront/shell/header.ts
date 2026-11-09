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

import { fillText } from '@b2b-catalog-platform/shared/platform';

import { SITE_CONFIG } from '../../core/site/site-config';
import { DEPLOYMENT_CONFIG } from '../../platform/config/deployment-config';
import { SHARED_TEXT } from '../../platform/config/shared-text';
import { STOREFRONT_TEXT } from '../../platform/config/storefront-text';
import { currentPath } from '../../platform/current-url';
import { HeaderCollapse } from '../../platform/header-collapse';
import { SearchField } from '../catalog/search/search-field';
import { CartLink } from '../ordering/cart/cart-link';
import { MobileSearch, SearchAnchor } from '../platform/mobile-search';
import { PAGE_LINK } from '../platform/nav-action';
import { AccountLink } from './account-link';
import { CatalogLink } from './catalog-link';
import { ContactInfo } from './contact-info';

/**
 * Two rows. From `sm`: company pages and contact, then brand, search and the
 * actions. Below it: brand and contact, then search alone, with the actions in
 * the bottom bar, and the header scrolls away. The results page sticks it at
 * every width, its top row sliding away on scroll.
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
  // contents, so the sticky <header> moves within the tall page column.
  host: { class: 'contents' },
  selector: 'app-header',
  template: `
    <!-- Collapsing slides the header up by its 40px top row, a transform
         that reserves both rows, so nothing below reflows. -->
    <header
      class="z-20 border-b border-edge bg-surface-subtle/85 backdrop-blur-sm
             transition-transform duration-300
             sm:sticky sm:top-0"
      [class]="headerClasses()"
    >
      <!-- The phone's top row; all of it is reachable from the panel too. -->
      <div
        class="flex mt-2 h-8 w-full items-center justify-between gap-4 px-4
               sm:hidden"
      >
        <a [routerLink]="'/'" [attr.aria-label]="homeLabel" class="shrink-0">
          <span
            aria-hidden="true"
            class="logo-mark block h-8"
            [style.aspect-ratio]="logoRatio"
          ></span>
        </a>
        <app-contact-info class="-mr-2 min-w-0 flex-1 justify-end" />
      </div>

      <!-- The utility bar: the links keep their width, the pills take the
           rest. -->
      <div class="hidden sm:block">
        <div
          class="mx-auto flex mt-2 h-8 w-full max-w-328 items-center
                 justify-between gap-4 px-4"
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
                [attr.data-label]="nav[route]"
                [class]="pageLink + ' text-center text-ink-subtle'"
              >
                {{ nav[route] }}
              </a>
            }
          </nav>
          @if (contact?.phone || contact?.email) {
            <app-contact-info class="min-w-0 flex-1 justify-end pr-1" />
          }
        </div>
      </div>

      <div
        #searchRow
        class="mx-auto flex h-15 w-full max-w-328 items-center justify-between
               px-4"
      >
        <!-- A mask, so it takes the accent on hover (.logo-mark). -->
        <a
          [routerLink]="'/'"
          [attr.aria-label]="homeLabel"
          class="hidden sm:block"
        >
          <span
            aria-hidden="true"
            class="logo-mark mr-3 block h-10"
            [style.aspect-ratio]="logoRatio"
          ></span>
        </a>

        <app-search-field #field class="min-w-0 flex-1 sm:mx-3" />

        <!-- From "sm"; below it the bottom bar draws them. -->
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
  private readonly siteConfig = inject(SITE_CONFIG);
  private readonly path = currentPath();

  private readonly headerCollapse = inject(HeaderCollapse);
  protected readonly collapsed = this.headerCollapse.collapsed;

  /** There the field holds the query being refined, so it stays on screen. */
  private readonly onSearchPage = computed(() => this.path() === '/search');

  protected readonly headerClasses = computed(() => {
    const sticky = this.onSearchPage() ? 'sticky top-0' : '';
    if (!this.collapsed()) return sticky;
    const brandRow = this.onSearchPage() ? '-translate-y-10 ' : '';
    return `${sticky} ${brandRow}sm:-translate-y-10`;
  });

  protected readonly text = inject(STOREFRONT_TEXT);
  protected readonly nav = inject(SHARED_TEXT).nav;
  protected readonly branding = this.config.branding;
  protected readonly logo = this.branding.logo;
  /** A mask has no size of its own: the ratio reserves the box before load. */
  protected readonly logoRatio = `${this.logo.width} / ${this.logo.height}`;
  protected readonly contact = this.config.contact;
  protected readonly a11y = this.text.a11y;
  protected readonly homeLabel = fillText(this.text.a11y.homeLink, {
    name: this.config.branding.name,
  });
  protected readonly utilityRoutes = this.siteConfig.pages.headerNav;
  protected readonly pageLink = PAGE_LINK;

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

    // Lent to the bottom bar's search tab while this header is on the page.
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
