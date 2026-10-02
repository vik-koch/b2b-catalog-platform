import { Component, computed, input, output } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { DiscButton } from '../ui/disc-button';
import { Icon } from '../ui/icons/icon';

/**
 * Where a cluster sits, and how big it is there:
 *
 * - `page` pins it to the top-right corner of a page section, level with the
 *   breadcrumb — the storefront's fixed spot for "act on this whole page".
 * - `inline` puts it in the flow, for a row that already has something on the
 *   left (a breadcrumb, a heading) and would be overlapped by a pinned cluster.
 * - `tile` is the smaller corner cluster on a grid item — tighter discs and a
 *   smaller glyph, because it sits on the picture rather than beside it.
 */
const variants = {
  page: {
    box: 'absolute top-0 right-0 z-10 flex gap-2',
    icon: 'h-4 w-4',
    size: 'md',
  },
  inline: { box: 'flex shrink-0 gap-2', icon: 'h-4 w-4', size: 'md' },
  tile: {
    box: 'absolute top-2 right-2 z-10 flex gap-1.5',
    icon: 'h-3 w-3',
    size: 'sm',
  },
} as const;

/**
 * The room a `page` cluster takes from the line it is pinned beside — three
 * discs and their gaps, with a gap to the text. A breadcrumb under the cluster
 * holds its end this far back while edit mode is on, or a long trail runs
 * beneath the discs on a phone.
 */
export const EDIT_ACTIONS_INSET = 'pr-30';

/**
 * The edit-mode cluster, wherever the storefront offers one: a page, a
 * category, a product, a grid tile. One component so the discs are always the
 * same size, the same distance apart and in the same corner — they were
 * drifting apart across five call sites, and a control that moves between
 * screens reads as a different control.
 *
 * The storefront only edits what is on it: open an editor, publish or
 * unpublish a product. Creating, deleting and restoring happen in the admin
 * lists, which the list disc leads to.
 *
 * Every affordance is optional: omit `editLink` for a cluster with no editor,
 * omit `publishLabel` for anything that is not a product. Rendering is the
 * caller's decision — the cluster assumes edit mode is already on and the
 * wording already loaded.
 */
@Component({
  selector: 'app-edit-actions',
  imports: [RouterLink, DiscButton, Icon],
  template: `
    <div [class]="style().box">
      <!-- Always in this order, so each disc keeps its place from page to
           page: the list first, being the one that leaves this page rather
           than acting on it; then the pencil; then the one step that belongs
           to this kind of page — a category's filters, a product's
           publication. -->
      @if (listLink(); as link) {
        <a
          appDiscButton
          [size]="style().size"
          [routerLink]="link"
          [queryParams]="listParams()"
          [attr.aria-label]="listLabel()"
          [attr.title]="listLabel()"
        >
          <app-icon name="table" [class]="style().icon" />
        </a>
      }
      @if (editLink(); as link) {
        <a
          appDiscButton
          [size]="style().size"
          [routerLink]="link"
          [queryParams]="editParams()"
          [attr.aria-label]="editLabel()"
          [attr.title]="editLabel()"
        >
          <app-icon name="pencil" [class]="style().icon" />
        </a>
      }
      @if (filtersLink(); as link) {
        <a
          appDiscButton
          [size]="style().size"
          [routerLink]="link"
          [queryParams]="filtersParams()"
          [attr.aria-label]="filtersLabel()"
          [attr.title]="filtersLabel()"
        >
          <app-icon name="funnel" [class]="style().icon" />
        </a>
      }
      @if (publishLabel(); as label) {
        <button
          appDiscButton
          [size]="style().size"
          type="button"
          [attr.aria-label]="label"
          [attr.title]="label"
          (click)="togglePublished.emit()"
        >
          <app-icon
            [name]="published() ? 'book-dashed' : 'book-check'"
            [class]="style().icon"
          />
        </button>
      }
    </div>
  `,
})
export class EditActions {
  readonly variant = input<keyof typeof variants>('page');
  /** The admin product list narrowed to what this page shows — the way back
   * from the storefront that a product's name in the list is the way out. */
  readonly listLink = input<unknown[] | null>(null);
  readonly listParams = input<Params | undefined>(undefined);
  readonly listLabel = input<string>('');
  /**
   * The category's filter panel (FR-ATTR-11) — which attributes this listing
   * offers as filters. Beside the pencil rather than inside the editor: it is
   * about what the visitor sees on *this* page, which is what edit mode is for.
   */
  readonly filtersLink = input<unknown[] | null>(null);
  readonly filtersParams = input<Params | undefined>(undefined);
  readonly filtersLabel = input<string>('');
  /** Router link for the pencil; omit for a cluster with no editor to open. */
  readonly editLink = input<unknown[] | null>(null);
  readonly editParams = input<Params | undefined>(undefined);
  readonly editLabel = input<string>('');
  /** Same switch for the publication toggle, which only products have. The
   * label states what the click will do, so it changes with the state. */
  readonly publishLabel = input<string | null>(null);
  readonly published = input(false);
  readonly togglePublished = output<void>();

  protected readonly style = computed(() => variants[this.variant()]);
}
