import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  categoryDisplayName,
  CategoryNode,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { disclosureState } from '../ui/disclosure-state';
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
 * below moves down by that much. The movement is the `0fr`→`1fr` row the app's
 * other disclosures use, armed only while the toggle's own movement runs.
 */
@Component({
  selector: 'app-category-children',
  imports: [RouterLink, ShowMoreToggle],
  template: `
    <ul [class]="listClass">
      @for (child of shown(); track child.slug) {
        <li>
          <a [routerLink]="['/catalog', child.slug]" [class]="lineClass">
            {{ displayName(child) }}
          </a>
        </li>
      }
    </ul>
    @if (rest().length) {
      <!-- The overflow row. Its content hides its own overflow so a zero
           track actually hides it; the list above stays out of the row, so
           the first few names never move. -->
      <div [class]="restRowClass()" [id]="restId()">
        <ul class="overflow-hidden">
          @for (child of rest(); track child.slug) {
            <li>
              <a [routerLink]="['/catalog', child.slug]" [class]="lineClass">
                {{ displayName(child) }}
              </a>
            </li>
          }
        </ul>
      </div>
      <app-show-more-toggle
        class="mt-1 justify-start"
        [expanded]="disclosure.open()"
        [moreLabel]="text.showMore"
        [lessLabel]="text.showLess"
        [controls]="restId()"
        (toggled)="disclosure.toggle()"
      />
    }
  `,
})
export class CategoryChildren {
  readonly parent = input.required<CategoryNode>();

  protected readonly text = inject(APP_TEXT).catalog;
  protected readonly disclosure = disclosureState(200);
  /** The parent's own slug, so several cells' toggles point at their own row. */
  protected readonly restId = computed(() => `children-${this.parent().slug}`);

  /** Shown under the parent, so a child may use its short name — the parent's
   * own name is right above it. */
  protected readonly displayName = categoryDisplayName;

  protected readonly shown = computed(() =>
    this.parent().children.slice(0, SHOWN),
  );
  protected readonly rest = computed(() => this.parent().children.slice(SHOWN));

  protected readonly listClass = 'mt-2 px-3 text-sm text-muted';
  protected readonly lineClass =
    'block py-0.5 hover:text-accent [overflow-wrap:anywhere]';

  protected readonly restRowClass = computed(() => {
    const move = this.disclosure.animated()
      ? 'transition-[grid-template-rows] duration-200 ease-out '
      : '';
    return `grid px-3 text-sm text-muted ${move}${
      this.disclosure.open() ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
    }`;
  });
}
