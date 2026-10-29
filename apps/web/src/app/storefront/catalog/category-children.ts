import { Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { categoryDisplayName } from '@b2b-catalog-platform/shared/core/catalog';
import { CategoryNode } from '@b2b-catalog-platform/shared/storefront/catalog';
import { ShowMoreList } from '@b2b-catalog-platform/ui/disclosure/show-more-list';

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
  imports: [RouterLink, ShowMoreList],
  template: `
    <ui-show-more-list
      class="mt-2 px-3 text-sm text-ink-subtle"
      [items]="parent().children"
      [limit]="SHOWN"
      [open]="open()"
      [restId]="restId()"
      [trackBy]="bySlug"
      (toggled)="open.set(!open())"
    >
      <ng-template let-child>
        <li>
          <a [routerLink]="['/catalog', child.slug]" [class]="lineClass">
            {{ displayName(child) }}
          </a>
        </li>
      </ng-template>
    </ui-show-more-list>
  `,
})
export class CategoryChildren {
  readonly parent = input.required<CategoryNode>();

  protected readonly open = signal(false);
  /** The parent's own slug, so several cells' toggles point at their own row. */
  protected readonly restId = computed(() => `children-${this.parent().slug}`);

  /** Shown under the parent, so a child may use its short name — the parent's
   * own name is right above it. */
  protected readonly displayName = categoryDisplayName;

  protected readonly SHOWN = SHOWN;
  protected readonly bySlug = (child: CategoryNode) => child.slug;

  protected readonly lineClass =
    'block py-0.5 hover:text-accent [overflow-wrap:anywhere]';
}
