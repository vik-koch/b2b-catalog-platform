import { Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { categoryDisplayName } from '@b2b-catalog-platform/shared/core/catalog';
import { CategoryNode } from '@b2b-catalog-platform/shared/storefront/catalog';
import { ShowMoreList } from '@b2b-catalog-platform/ui/disclosure/show-more-list';

/** More, and the cell's row reads as a column of its own. */
const SHOWN = 4;

/** The subcategories under one index chip, as lines read down at a glance.
 * Under the chip, not inside it: the chip keeps one shape everywhere. */
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
  protected readonly restId = computed(() => `children-${this.parent().slug}`);

  /** The short name: the parent's own stands right above. */
  protected readonly displayName = categoryDisplayName;

  protected readonly SHOWN = SHOWN;
  protected readonly bySlug = (child: CategoryNode) => child.slug;

  protected readonly lineClass =
    'block py-0.5 hover:text-accent [overflow-wrap:anywhere]';
}
