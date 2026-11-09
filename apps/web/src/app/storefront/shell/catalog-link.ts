import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { storeIcon } from '@b2b-catalog-platform/ui/icons/glyphs/store';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';

import { SHARED_TEXT } from '../../platform/config/shared-text';
import { currentPath, isUnder } from '../../platform/current-url';
import { navActionClasses, NavVariant } from '../platform/nav-action';

/** Routes that count as "browsing the catalogue" for the navbar's active state. */
const CATALOG_ROUTES = ['/catalog', '/product', '/search'];

/** The catalogue control; current under any of `CATALOG_ROUTES`, which a
 * prefix match on `/catalog` alone would miss. */
@Component({
  selector: 'app-catalog-link',
  imports: [RouterLink, Icon],
  template: `
    <a
      routerLink="/catalog"
      [attr.aria-current]="active() ? 'page' : null"
      [class]="cls().action"
    >
      <ui-icon [glyph]="storeIcon" class="size-6" />
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

  private readonly path = currentPath();
  protected readonly label = inject(SHARED_TEXT).nav.catalog;
  protected readonly active = computed(() =>
    CATALOG_ROUTES.some((route) => isUnder(this.path(), route)),
  );
}
