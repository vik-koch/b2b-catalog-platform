import { Component, computed, input, signal } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import {
  CatalogImage,
  categoryDisplayName,
} from '@b2b-catalog-platform/shared';
import { HighlightedLine } from '../core/highlighted-line';

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
  'flex w-full items-center pl-3 overflow-hidden rounded-xl bg-stone-125 text-base tracking-tight transition-colors hover:bg-stone-200 hover:text-accent';

/** The mark is the chip's full height and square — the upload stores a square
 * — so nothing is cropped here; only how much of the chip it takes changes. */
const CHIP_SIZES: Record<CategoryChipSize, { link: string; mark: string }> = {
  responsive: {
    link: 'h-16 sm:h-24',
    mark: 'h-16 w-16 sm:h-24 sm:w-24',
  },
  small: { link: 'h-16', mark: 'h-16 w-16' },
};

/**
 * A category as a chip: the one way the storefront draws a category — the
 * index, the main page and the subcategory navigation of a listing alike. The
 * mark (FR-CAT-07) sits beside the name rather than instead of it — a mark
 * identifies a category faster than its name does, but only once you already
 * know it, so the name never leaves, and a category with no mark is simply a
 * name in the same box.
 *
 * The mark runs edge to edge over the chip's right end and the chip's corners
 * clip it. Any margin around the artwork is the picture's own, which is what
 * lets a mark sit its drawing against the chip's bottom edge if it wants to.
 *
 * The chip has no width of its own; it fills whatever its <li> was given, which
 * is where the row decides how wide a chip is (see SUBS_LIST in CategoryGrid
 * and CATEGORY_GRID in CategoryIndex).
 */
@Component({
  selector: 'app-category-chip',
  imports: [RouterLink, HighlightedLine],
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
      @if (context(); as context) {
        <!-- The name over the category it sits in, where the chip stands
             away from the tree that would otherwise say so. Tighter lines
             than a bare name, so two lines of it and the parent's fit the
             small chip whole: 2 × 20px + 16px leaves 4px either side of 64. -->
        <span [class]="contextClass()">
          <span class="line-clamp-2 leading-5">
            <app-highlighted-line
              [line]="label()"
              [query]="query()"
              [alternateQuery]="alternateQuery()"
            />
          </span>
          <span class="truncate text-xs leading-4 text-subtle">{{
            context
          }}</span>
        </span>
      } @else if (query()) {
        <span [class]="nameClass()">
          <app-highlighted-line
            [line]="label()"
            [query]="query()"
            [alternateQuery]="alternateQuery()"
          />
        </span>
      } @else {
        <span [class]="nameClass()">{{ label() }}</span>
      }
      @if (shownMark(); as mark) {
        <img
          [src]="mark.thumb"
          alt=""
          loading="lazy"
          [class]="markClass()"
          (error)="markFailed.set(true)"
        />
      }
    </a>
  `,
})
export class CategoryChip {
  readonly category = input.required<CategoryChipTarget>();
  /** Carried through so a chip can keep the listing's sort and filters. */
  readonly queryParams = input<Params | null>(null);
  readonly size = input<CategoryChipSize>('responsive');
  /** Greyed like a facet value with no matches: nothing under the listing's
   * filters is in it. Still a link — it is the category that is empty, not
   * the way into it. */
  readonly muted = input(false);
  /** The category this one sits in, as a second line — for a chip shown away
   * from the tree, as a search suggestion is (FR-SEARCH-07). */
  readonly context = input<string | null>(null);
  /** Marks the part of the name a query matched, as a suggestion row does. */
  readonly query = input('');
  readonly alternateQuery = input<string | null>(null);

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
    () =>
      `${CHIP_BASE} ${CHIP_SIZES[this.size()].link} ${
        this.muted() ? 'text-stone-400' : 'text-stone-800'
      }`,
  );
  protected readonly markClass = computed(
    () =>
      `shrink-0 object-cover ${CHIP_SIZES[this.size()].mark}${
        this.muted() ? ' opacity-40' : ''
      }`,
  );
  /**
   * The name takes whatever the mark leaves and wraps inside it, clipped at
   * two lines: the chip's height is fixed, so a long name has to end somewhere
   * rather than push the row open.
   *
   * The name starts at the same place whether or not a mark follows it, so
   * names line up down a column of chips. With no mark it keeps a gap off the
   * right edge instead of running into it.
   */
  protected readonly contextClass = computed(
    () =>
      `flex min-w-0 flex-1 flex-col [overflow-wrap:anywhere]${
        this.shownMark() ? ' pr-2' : ' pr-3'
      }`,
  );
  protected readonly nameClass = computed(
    () =>
      `line-clamp-3 min-w-0 flex-1 [overflow-wrap:anywhere]${
        this.shownMark() ? '' : ' pr-3'
      }`,
  );
}
