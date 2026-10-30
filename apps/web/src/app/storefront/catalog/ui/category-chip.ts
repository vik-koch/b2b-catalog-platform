import { Component, computed, input, signal } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import {
  CatalogImage,
  categoryDisplayName,
} from '@b2b-catalog-platform/shared/core/catalog';
import { HighlightedLine } from '@b2b-catalog-platform/ui/suggest/highlighted-line';
import { MatchSegmentsPipe } from '../../../core/catalog/search/match-segments.pipe';

/** Both a tree node and a drill-down link fit as they arrive. */
export interface CategoryChipTarget {
  slug: string;
  name: string;
  shortName: string | null;
  mark: CatalogImage | null;
}

/** `responsive` drops to the small form below `sm`; `small` is fixed, for
 * categories shown beside something else. A size apart and nothing else. */
export type CategoryChipSize = 'responsive' | 'small';

const CHIP_BASE = `flex w-full items-center pl-3 overflow-hidden rounded-xl
                   bg-chip text-base tracking-tight transition-colors
                   hover:bg-chip-hover hover:text-accent-strong`;

/** The mark is the chip's full height and square, as uploads are. */
const CHIP_SIZES: Record<CategoryChipSize, { link: string; mark: string }> = {
  responsive: {
    link: 'h-16 sm:h-24',
    mark: 'h-16 w-16 sm:h-24 sm:w-24',
  },
  small: { link: 'h-16', mark: 'h-16 w-16' },
};

/**
 * The one way the storefront draws a category. The mark (FR-CAT-07) stands
 * beside the name, never instead of it, edge to edge and clipped by the chip's
 * corners. No width of its own: the grid around it decides.
 */
@Component({
  selector: 'app-category-chip',
  imports: [RouterLink, HighlightedLine, MatchSegmentsPipe],
  // `w-full` carries the <li>'s width through to the link; without it the host
  // collapses and the width becomes a gap beside the chip.
  host: { class: 'flex w-full' },
  template: `
    <a
      [routerLink]="['/catalog', category().slug]"
      [queryParams]="queryParams()"
      [class]="linkClass()"
    >
      @if (context(); as context) {
        <!-- Tighter lines, so two of the name and the parent's fit the small
             chip: 2 × 20px + 16px leaves 4px either side of 64. -->
        <span [class]="contextClass()">
          <span class="line-clamp-2 leading-5">
            <ui-highlighted-line
              [segments]="label() | matchSegments: query() : alternateQuery()"
            />
          </span>
          <span class="truncate text-xs/4 text-ink-subtle">{{ context }}</span>
        </span>
      } @else if (query()) {
        <span [class]="nameClass()">
          <ui-highlighted-line
            [segments]="label() | matchSegments: query() : alternateQuery()"
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
  readonly queryParams = input<Params | null>(null);
  readonly size = input<CategoryChipSize>('responsive');
  /** Nothing under the listing's filters is in it. Still a link. */
  readonly muted = input(false);
  /** The parent's name as a second line, away from the tree (FR-SEARCH-07). */
  readonly context = input<string | null>(null);
  /** Marks the part of the name a query matched, as a suggestion row does. */
  readonly query = input('');
  readonly alternateQuery = input<string | null>(null);

  /** A mark that fails to load leaves the name alone, not a broken icon. */
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
        this.muted() ? 'text-ink-subtle' : 'text-ink'
      }`,
  );
  protected readonly markClass = computed(
    () =>
      `shrink-0 object-cover ${CHIP_SIZES[this.size()].mark}${
        this.muted() ? ' opacity-40' : ''
      }`,
  );
  /** Clamped: the chip's height is fixed. Without a mark the name keeps a gap
   * off the right edge. */
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
