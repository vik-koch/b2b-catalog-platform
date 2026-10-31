import { Component, computed, input } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { chevronRightIcon } from '../icons/glyphs/chevron-right';
import { Icon } from '../icons/icon';

export interface Crumb {
  readonly label: string;
  readonly link: string | readonly unknown[];
  readonly queryParams?: Params | null;
}

/**
 * The trail to the current page: links, then the page itself. Inline, not
 * flex: a flexed crumb drops whole onto the next line, where text wraps.
 *
 *   <ui-breadcrumbs [label]="text.trail" [crumbs]="crumbs()"
 *     [current]="item().name" currentFrom="sm" />
 */
@Component({
  selector: 'ui-breadcrumbs',
  imports: [Icon, RouterLink],
  host: { class: 'block' },
  template: `
    <nav [attr.aria-label]="label()">
      <ol role="list" class="text-sm text-ink-subtle">
        @for (crumb of crumbs(); track $index) {
          @if (!$first) {
            <li aria-hidden="true" class="inline">
              <ui-icon [glyph]="chevronRightIcon" [class]="separator" />
            </li>
          }
          <li class="inline">
            <a
              [routerLink]="crumb.link"
              [queryParams]="crumb.queryParams ?? null"
              class="hover:text-accent"
            >
              {{ crumb.label }}
            </a>
          </li>
        }
        @if (crumbs().length) {
          <li aria-hidden="true" [class]="currentItem()">
            <ui-icon [glyph]="chevronRightIcon" [class]="separator" />
          </li>
        }
        <li [class]="currentItem()">
          <span aria-current="page" class="font-medium text-ink">
            {{ current() }}
          </span>
        </li>
      </ol>
    </nav>
  `,
})
export class Breadcrumbs {
  protected readonly chevronRightIcon = chevronRightIcon;
  protected readonly separator = 'mx-1 size-4 align-middle text-edge-strong';

  /** The trail's accessible name. */
  readonly label = input.required<string>();
  readonly crumbs = input<readonly Crumb[]>([]);
  readonly current = input.required<string>();
  /** `sm` leaves the current page out below it, for a page whose heading
   * right under the trail says the same. */
  readonly currentFrom = input<'sm' | null>(null);

  protected readonly currentItem = computed(() =>
    this.currentFrom() === 'sm' ? 'hidden sm:inline' : 'inline',
  );
}
