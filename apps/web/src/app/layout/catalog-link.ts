import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { StoreIcon } from '../ui/icons/store-icon';
import { NAV_ACTION, NAV_ACTION_LABEL } from './nav-action';

/**
 * The catalogue button in the main navbar — a plain link to the storefront,
 * built on the same NAV_ACTION look as the account link (icon over label,
 * active state driven by `aria-current="page"`).
 */
@Component({
  selector: 'app-catalog-link',
  imports: [RouterLink, RouterLinkActive, StoreIcon],
  template: `
    <a
      routerLink="/catalog"
      routerLinkActive
      ariaCurrentWhenActive="page"
      [class]="navAction"
    >
      <app-icon-store class="h-6 w-6" />
      <span [class]="labelClass">{{ text.navLabel }}</span>
    </a>
  `,
})
export class CatalogLink {
  protected readonly text = inject(APP_TEXT).catalog;
  protected readonly navAction = NAV_ACTION;
  protected readonly labelClass = NAV_ACTION_LABEL;
}
