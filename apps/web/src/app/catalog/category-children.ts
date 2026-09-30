import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  categoryDisplayName,
  CategoryNode,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { Collapsible } from '../ui/collapsible';
import { ShowMoreToggle } from '../ui/show-more-toggle';

/** How many subcategories stand under a chip before the rest are behind the
 * toggle. Four is what the tallest cell can carry without the row it sits in
 * looking like a column of its own. */
const SHOWN = 4;

/**
 * The subcategories under one chip in the index, as lines rather than as pills:
 * a name per line is read down the column at a glance, where wrapped pills have
 * to be picked out of a paragraph of them.
 *
 * Under the chip and not inside it, because the chip is one object the whole
 * catalogue reuses (see CategoryChip) and text of a length nobody chose would
 * make it a different shape here than everywhere else.
 *
 * The rest open in place: the cell grows, its row grows with it, and everything
 * below moves down by that much (see Collapsible).
 */
@Component({
  selector: 'app-category-children',
  imports: [Collapsible, RouterLink, ShowMoreToggle],
  template: `
    <ul [class]="'mt-2 ' + listClass">
      @for (child of shown(); track child.slug) {
        <li>
          <a [routerLink]="['/catalog', child.slug]" [class]="lineClass">
            {{ displayName(child) }}
          </a>
        </li>
      }
    </ul>
    @if (rest().length) {
      <app-collapsible [open]="open()" [id]="restId()">
        <ul [class]="listClass">
          @for (child of rest(); track child.slug) {
            <li>
              <a [routerLink]="['/catalog', child.slug]" [class]="lineClass">
                {{ displayName(child) }}
              </a>
            </li>
          }
        </ul>
      </app-collapsible>
      <app-show-more-toggle
        class="mt-1 justify-start"
        [expanded]="open()"
        [moreLabel]="text.showMore"
        [lessLabel]="text.showLess"
        [controls]="restId()"
        (toggled)="open.set(!open())"
      />
    }
  `,
})
export class CategoryChildren {
  readonly parent = input.required<CategoryNode>();

  protected readonly text = inject(APP_TEXT).catalog;
  protected readonly open = signal(false);
  /** The parent's own slug, so several cells' toggles point at their own row. */
  protected readonly restId = computed(() => `children-${this.parent().slug}`);

  /** Shown under the parent, so a child may use its short name — the parent's
   * own name is right above it. */
  protected readonly displayName = categoryDisplayName;

  protected readonly shown = computed(() =>
    this.parent().children.slice(0, SHOWN),
  );
  protected readonly rest = computed(() => this.parent().children.slice(SHOWN));

  protected readonly listClass = 'px-3 text-sm text-muted';
  protected readonly lineClass =
    'block py-0.5 hover:text-accent [overflow-wrap:anywhere]';
}
