import { Component, computed, input, signal } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import {
  CatalogImage,
  categoryDisplayName,
} from '@b2b-catalog-platform/shared';

/**
 * What the chip needs of a category — the shape both the public tree node and
 * the drill-down link already have, so either can be handed over as it arrives
 * from the API.
 */
export interface CategoryChipTarget {
  slug: string;
  name: string;
  shortName: string | null;
  mark: CatalogImage | null;
}

/**
 * How tall a chip is drawn. `responsive` is the one every list uses: the big
 * form, dropping to the small one below the viewport's `sm`, where a chip is a
 * full-width row on a phone rather than one cell of a grid. `small` is the
 * fixed short form, for a place that shows categories beside something else.
 *
 * The two are a size apart and nothing else — same ground, same radius, same
 * type — because a chip has to be recognised as the same object wherever the
 * catalogue puts one.
 */
export type CategoryChipSize = 'responsive' | 'small';

const CHIP_BASE =
  'flex w-full items-center gap-3 px-3 rounded-xl bg-stone-125 text-base text-stone-800 transition-colors hover:bg-stone-200 hover:text-accent';

/** The box and the picture are the same shape — the upload stores a square —
 * so nothing is cropped here; only how much of the chip it takes changes. */
const CHIP_SIZES: Record<CategoryChipSize, { link: string; mark: string }> = {
  responsive: {
    link: 'h-16 sm:h-24',
    mark: 'h-10 w-10 sm:h-18 sm:w-18',
  },
  small: { link: 'h-16', mark: 'h-10 w-10' },
};

/**
 * A category as a chip: the one way the storefront draws a category — the
 * index, the main page and the subcategory navigation of a listing alike. The
 * mark (FR-CAT-07) sits beside the name rather than instead of it — a mark
 * identifies a category faster than its name does, but only once you already
 * know it, so the name never leaves, and a category with no mark is simply a
 * name in the same box.
 *
 * The chip has no width of its own; it fills whatever its <li> was given, which
 * is where the row decides how wide a chip is (see SUBS_LIST in CategoryGrid
 * and CATEGORY_GRID in CategoryIndex).
 */
@Component({
  selector: 'app-category-chip',
  imports: [RouterLink],
  // The host is a flex item of the <li> it sits in and a flex box for the link
  // it holds. `w-full` is what carries the item's width through to the link:
  // without it the host collapses around its own content and the width the
  // <li> was given turns into gap beside the chip instead of chip.
  host: { class: 'flex w-full' },
  template: `
    <a
      [routerLink]="['/catalog', category().slug]"
      [queryParams]="queryParams()"
      [class]="linkClass()"
    >
      @if (shownMark(); as mark) {
        <img
          [src]="mark.thumb"
          alt=""
          loading="lazy"
          [class]="markClass()"
          (error)="markFailed.set(true)"
        />
      }
      <span [class]="nameClass()">{{ label() }}</span>
    </a>
  `,
})
export class CategoryChip {
  readonly category = input.required<CategoryChipTarget>();
  /** Carried through so a chip can keep the listing's sort and filters. */
  readonly queryParams = input<Params | null>(null);
  readonly size = input<CategoryChipSize>('responsive');

  /** A mark whose file 404s is no mark at all — the fallback is the name, not
   * the browser's broken-image icon in a chip that says nothing else. */
  protected readonly markFailed = signal(false);
  protected readonly shownMark = computed(() =>
    this.markFailed() ? null : this.category().mark,
  );

  protected readonly label = computed(() =>
    categoryDisplayName(this.category()),
  );

  protected readonly linkClass = computed(
    () => `${CHIP_BASE} ${CHIP_SIZES[this.size()].link}`,
  );
  protected readonly markClass = computed(
    () => `shrink-0 rounded-md object-cover ${CHIP_SIZES[this.size()].mark}`,
  );
  /**
   * The name takes whatever the mark leaves and wraps inside it, clipped at
   * two lines: the chip's height is fixed, so a long name has to end somewhere
   * rather than push the row open.
   *
   * With no mark it starts a mark's own gap further in rather than against the
   * chip's padding: a name alone on the left edge reads as a chip that lost
   * something, and the indent makes it a chip that never had one.
   */
  protected readonly nameClass = computed(
    () =>
      `line-clamp-3 min-w-0 flex-1 [overflow-wrap:anywhere]${
        this.shownMark() ? '' : ' pl-3'
      }`,
  );
}
