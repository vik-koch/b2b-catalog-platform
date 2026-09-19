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
 * A category as a chip: the subcategory navigation of a listing. The mark
 * (FR-CAT-07) sits beside the name rather than instead of it — a mark
 * identifies a category faster than its name does, but only once you already
 * know it, so the name never leaves.
 *
 * The chip has no width of its own; it fills whatever its <li> was given, which
 * is where the row decides how wide a chip is (see SUBS_LIST in CategoryGrid).
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
      [class]="linkClass"
    >
      @if (shownMark(); as mark) {
        <img
          [src]="mark.thumb"
          alt=""
          loading="lazy"
          [class]="markClass"
          (error)="markFailed.set(true)"
        />
      }
      <span [class]="nameClass">{{ label() }}</span>
    </a>
  `,
})
export class CategoryChip {
  readonly category = input.required<CategoryChipTarget>();
  /** Carried through so a chip can keep the listing's sort and filters. */
  readonly queryParams = input<Params | null>(null);

  /** A mark whose file 404s is no mark at all — the fallback is the name, not
   * the browser's broken-image icon in a chip that says nothing else. */
  protected readonly markFailed = signal(false);
  protected readonly shownMark = computed(() =>
    this.markFailed() ? null : this.category().mark,
  );

  protected readonly label = computed(() =>
    categoryDisplayName(this.category()),
  );

  protected readonly linkClass =
    'flex h-16 w-full items-center gap-3 px-3 rounded-xl bg-stone-100 text-sm font-medium text-stone-800 transition-colors hover:bg-stone-200 hover:text-accent';

  /** A square, because that is what the upload stores (see the media route):
   * the box and the picture are the same shape, so nothing is cropped here. */
  protected readonly markClass = 'h-10 w-10 shrink-0 rounded-md object-cover';
  /**
   * The name takes whatever the mark leaves and wraps inside it, clipped at
   * two lines: the chip's height is fixed, so a long name has to end somewhere
   * rather than push the row open.
   */
  protected readonly nameClass =
    'line-clamp-2 min-w-0 flex-1 [overflow-wrap:anywhere]';
}
