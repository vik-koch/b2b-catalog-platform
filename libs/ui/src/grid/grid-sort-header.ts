import { Component, computed, input } from '@angular/core';
import { Icon } from '../icons/icon';
import { gridParam, injectGridNav } from './grid-nav';
import { chevronDownIcon } from '../icons/glyphs/chevron-down';
import { chevronUpIcon } from '../icons/glyphs/chevron-up';

/** A sortable column heading (FR-ADM-05), writing its own `sort` parameter. */
@Component({
  selector: 'app-grid-sort',
  imports: [Icon],
  host: {
    // `group` so the affordance chevron can appear on hover; see the icon.
    class: 'group py-2 font-medium',
  },
  template: `
    <button
      type="button"
      class="inline-flex cursor-pointer items-center gap-1 hover:text-accent"
      [class.text-ink]="active()"
      (click)="toggle()"
    >
      {{ label() }}
      <!-- Inked only for the sort in effect or under the pointer: a row of
           permanent arrows is noise. -->
      <app-icon
        [glyph]="descending() ? chevronDownIcon : chevronUpIcon"
        [class]="iconClass()"
      />
    </button>
  `,
})
export class GridSortHeader {
  protected readonly chevronDownIcon = chevronDownIcon;
  protected readonly chevronUpIcon = chevronUpIcon;
  private readonly navigate = injectGridNav();

  /** The sort key this column applies when first clicked, and its reverse. */
  readonly asc = input.required<string>();
  readonly desc = input.required<string>();
  /** The sort in effect, resolved; null where no column owns it. */
  readonly sort = input.required<string | null>();
  readonly label = input.required<string>();
  /** The key written as an absent parameter, so its column reads as unsorted. */
  readonly defaultSort = input('');
  /** A first click sorts descending (recency). `asc`/`desc` still name the
   * directions, so what is announced stays true. */
  readonly descFirst = input(false);

  protected readonly active = computed(
    () => this.sort() === this.asc() || this.sort() === this.desc(),
  );
  protected readonly descending = computed(() => this.sort() === this.desc());

  protected readonly iconClass = computed(
    () =>
      `h-3.5 w-3.5 transition-opacity
       ${this.active() ? '' : 'opacity-0 group-hover:opacity-40'}`,
  );

  /** Clicking the column in effect reverses it; clicking any other takes the
   * sort over in that column's first direction. */
  protected toggle(): void {
    const [first, second] = this.descFirst()
      ? [this.desc(), this.asc()]
      : [this.asc(), this.desc()];
    const next = this.sort() === first ? second : first;
    this.navigate({ sort: gridParam(next, this.defaultSort()) });
  }
}
