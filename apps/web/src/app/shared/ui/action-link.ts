import { Component } from '@angular/core';

/**
 * A named group, or a hovered row around it lights it too. Flex, not
 * inline-flex, which sits on the baseline with a descender under it.
 */
const base = `group/action flex w-fit items-center text-xs font-medium
              text-warning
              hover:text-accent`;

/**
 * A link to work that waits for someone: an amber dot, the sentence, and an
 * arrow into the list it opens.
 *
 *   <a appActionLink routerLink="/orders" [queryParams]="{ status: 'open' }">
 *     {{ count }} orders to confirm
 *   </a>
 */
@Component({
  selector: 'a[appActionLink]',
  host: { class: base },
  template: `
    <span
      aria-hidden="true"
      class="mr-2 size-1.5 shrink-0 rounded-full bg-warning-dot"
    ></span>
    <!-- Under the arrow too, the underline reads as a strike. -->
    <span class="pr-1 group-hover/action:underline"><ng-content /></span>
    <span
      aria-hidden="true"
      class="font-bold transition-transform group-hover/action:translate-x-0.5"
      >&rarr;</span
    >
  `,
})
export class ActionLink {}
