import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { currentUrl } from '../core/current-url';
import { StoreIcon } from '../ui/icons/store-icon';
import { NAV_ACTION, NAV_ACTION_LABEL } from './nav-action';

/** Routes that count as "browsing the catalogue" for the navbar's active state. */
const CATALOG_ROUTES = ['/catalog', '/product', '/search'];

/**
 * The catalogue button in the main navbar — a plain link to the storefront,
 * built on the same NAV_ACTION look as the account link (icon over label,
 * active state driven by `aria-current="page"`).
 *
 * The active state is computed from the URL rather than left to
 * `routerLinkActive`: product pages and search results live under their own
 * top-level paths, so a prefix match on `/catalog` alone would drop the
 * highlight mid-browse.
 */
@Component({
  selector: 'app-catalog-link',
  imports: [RouterLink, StoreIcon],
  template: `
    <a
      routerLink="/catalog"
      [attr.aria-current]="active() ? 'page' : null"
      [class]="navAction"
    >
      <app-icon-store class="h-6 w-6" />
      <span [class]="labelClass" [attr.data-label]="text.navLabel">{{
        text.navLabel
      }}</span>
    </a>
  `,
})
export class CatalogLink {
  private readonly url = currentUrl();
  protected readonly text = inject(APP_TEXT).catalog;
  protected readonly active = computed(() => {
    const path = this.url().split(/[?#]/)[0];
    return CATALOG_ROUTES.some(
      (route) => path === route || path.startsWith(`${route}/`),
    );
  });
  protected readonly navAction = NAV_ACTION;
  protected readonly labelClass = NAV_ACTION_LABEL;
}
