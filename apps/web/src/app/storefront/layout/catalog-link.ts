import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { currentUrl } from '../../shared/core/current-url';
import { navActionClasses, NavVariant } from './nav-action';
import { Icon } from '../../shared/ui/icons/icon';
import { storeIcon } from '../../shared/ui/icons/glyphs/store';

/** Routes that count as "browsing the catalogue" for the navbar's active state. */
const CATALOG_ROUTES = ['/catalog', '/product', '/search'];

/**
 * The catalogue button in the main navbar — a plain link to the storefront,
 * built on the same shared look as the account link (icon over label,
 * active state driven by `aria-current="page"`).
 *
 * The active state is computed from the URL rather than left to
 * `routerLinkActive`: product pages and search results live under their own
 * top-level paths, so a prefix match on `/catalog` alone would drop the
 * highlight mid-browse.
 */
@Component({
  selector: 'app-catalog-link',
  imports: [RouterLink, Icon],
  template: `
    <a
      routerLink="/catalog"
      [attr.aria-current]="active() ? 'page' : null"
      [class]="cls().action"
    >
      <app-icon [glyph]="storeIcon" class="size-6" />
      <span [class]="cls().labelRow">
        <span [class]="cls().label" [attr.data-label]="label">{{ label }}</span>
      </span>
    </a>
  `,
})
export class CatalogLink {
  protected readonly storeIcon = storeIcon;
  /** Which of the two navbars is drawing this control. */
  readonly variant = input<NavVariant>('bar');
  protected readonly cls = computed(() => navActionClasses(this.variant()));

  private readonly url = currentUrl();
  protected readonly label = inject(SHARED_TEXT).nav.catalog;
  protected readonly active = computed(() => {
    const path = this.url().split(/[?#]/)[0];
    return CATALOG_ROUTES.some(
      (route) => path === route || path.startsWith(`${route}/`),
    );
  });
}
