import { Component, computed, input, output } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { IconButton } from '../ui/icon-button';
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
 * The edit-mode edit/delete cluster, wherever the storefront offers one: a page,
 * a category, a product, a grid tile. One component so the pencil and the bin
 * are always the same size, the same distance apart and in the same corner —
 * they were drifting apart across five call sites, and a control that moves
 * between screens reads as a different control.
 *
 * Every affordance is optional: omit the `add*` links where nothing is created
 * from here, omit `editLink` for a cluster with no editor,
 * omit `deleteLabel` where deleting does not belong (a static page, the
 * catalogue root — and the grid tiles, where the bin was noise beside an edit
 * people reach for far more often), omit `publishLabel` for anything that is not
 * a product. Rendering is the caller's decision — the cluster assumes edit mode
 * is already on and the wording already loaded.
 */
@Component({
  selector: 'app-edit-actions',
  imports: [RouterLink, IconButton, Icon],
  template: `
    <div [class]="style().box">
      <!-- Creating comes before editing, and a container before what goes in
           it: folder, file, then the pencil that acts on this page itself. -->
      @if (addCategoryLink(); as link) {
        <a
          appIconButton
          [size]="style().size"
          [routerLink]="link"
          [queryParams]="addCategoryParams()"
          [attr.aria-label]="addCategoryLabel()"
          [attr.title]="addCategoryLabel()"
        >
          <app-icon name="folder-plus" [class]="style().icon" />
        </a>
      }
      @if (addProductLink(); as link) {
        <a
          appIconButton
          [size]="style().size"
          [routerLink]="link"
          [queryParams]="addProductParams()"
          [attr.aria-label]="addProductLabel()"
          [attr.title]="addProductLabel()"
        >
          <app-icon name="file-plus" [class]="style().icon" />
        </a>
      }
      @if (editLink(); as link) {
        <a
          appIconButton
          [size]="style().size"
          [routerLink]="link"
          [queryParams]="editParams()"
          [attr.aria-label]="editLabel()"
          [attr.title]="editLabel()"
        >
          <app-icon name="pencil" [class]="style().icon" />
        </a>
      }
      @if (publishLabel(); as label) {
        <button
          appIconButton
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
      @if (deleteLabel(); as label) {
        <button
          appIconButton
          variant="danger"
          [size]="style().size"
          type="button"
          [attr.aria-label]="label"
          [attr.title]="label"
          (click)="remove.emit()"
        >
          <app-icon name="trash-2" [class]="style().icon" />
        </button>
      }
    </div>
  `,
})
export class EditActions {
  readonly variant = input<keyof typeof variants>('page');
  /**
   * "New category here" and "new product here" — the two creation affordances,
   * each its own optional link. They live in the cluster rather than as a tile
   * among the content because a dashed placeholder card sat in the grid
   * pretending to be a product, moved as the grid reflowed, and cost the
   * listing a column at every width.
   */
  readonly addCategoryLink = input<unknown[] | null>(null);
  readonly addCategoryParams = input<Params | undefined>(undefined);
  readonly addCategoryLabel = input<string>('');
  readonly addProductLink = input<unknown[] | null>(null);
  readonly addProductParams = input<Params | undefined>(undefined);
  readonly addProductLabel = input<string>('');
  /** Router link for the pencil; omit for a cluster with no editor to open. */
  readonly editLink = input<unknown[] | null>(null);
  readonly editParams = input<Params | undefined>(undefined);
  readonly editLabel = input<string>('');
  /** Doubles as the switch for the bin: no label, no delete affordance. */
  readonly deleteLabel = input<string | null>(null);
  readonly remove = output<void>();
  /** Same switch for the publication toggle, which only products have. The
   * label states what the click will do, so it changes with the state. */
  readonly publishLabel = input<string | null>(null);
  readonly published = input(false);
  readonly togglePublished = output<void>();

  protected readonly style = computed(() => variants[this.variant()]);
}
