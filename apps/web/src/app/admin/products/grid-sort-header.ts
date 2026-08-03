import { Component, computed, input } from '@angular/core';
import { AdminProductSort } from '@b2b-catalog-platform/shared';
import { LucideIcon } from '../../ui/icons/lucide-icon';
import { gridParam, DEFAULT_ADMIN_SORT, injectGridNav } from './grid-query';

/**
 * A sortable column heading for the admin product grid (FR-ADM-05) — the
 * ordering control lives in the header the column belongs to, which is where a
 * table's sort belongs and where an admin looks for it.
 */
@Component({
  selector: 'app-grid-sort',
  imports: [LucideIcon],
  host: {
    // `group` so the affordance chevron can appear on hover; see the icon.
    class: 'group py-2 font-medium',
  },
  template: `
    <button
      type="button"
      class="inline-flex cursor-pointer items-center gap-1 hover:text-accent"
      [class.text-stone-700]="active()"
      (click)="toggle()"
    >
      {{ label() }}
      <!-- Present in every sortable header, but only inked when the column is
           the one in effect (or under the pointer): a row of permanent arrows
           reads as noise, and a header that gains an icon on hover says
           "clickable" without claiming to be sorted. -->
      <app-lucide-icon
        [name]="descending() ? 'chevron-down' : 'chevron-up'"
        [class]="iconClass()"
      />
    </button>
  `,
})
export class GridSortHeader {
  private readonly navigate = injectGridNav();

  /** The sort key this column applies when first clicked, and its reverse. */
  readonly asc = input.required<AdminProductSort>();
  readonly desc = input.required<AdminProductSort>();
  /** The sort in effect, already resolved — null when no column owns it. */
  readonly sort = input.required<AdminProductSort | null>();
  readonly label = input.required<string>();
  /**
   * Which direction a first click takes. Ascending everywhere except recency,
   * where "most recently updated" is the whole reason to sort by the column and
   * oldest-first would be a step nobody wants. Only the first click moves —
   * `asc`/`desc` keep naming the directions, so what is announced stays true.
   */
  readonly descFirst = input(false);

  protected readonly active = computed(
    () => this.sort() === this.asc() || this.sort() === this.desc(),
  );
  protected readonly descending = computed(() => this.sort() === this.desc());

  protected readonly iconClass = computed(
    () =>
      `h-3.5 w-3.5 transition-opacity ${
        this.active() ? '' : 'opacity-0 group-hover:opacity-40'
      }`,
  );

  /** Clicking the column in effect reverses it; clicking any other takes the
   * sort over in that column's first direction. */
  protected toggle(): void {
    const [first, second] = this.descFirst()
      ? [this.desc(), this.asc()]
      : [this.asc(), this.desc()];
    const next = this.sort() === first ? second : first;
    this.navigate({ sort: gridParam(next, DEFAULT_ADMIN_SORT) });
  }
}
