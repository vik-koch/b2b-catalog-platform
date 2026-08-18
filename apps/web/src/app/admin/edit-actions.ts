import { Component, computed, input, output } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { IconButton } from '../ui/icon-button';
import { Icon } from '../ui/icons/icon';

/**
 * Where a cluster sits, which is the only thing that differs between them:
 *
 * - `page` pins it to the top-right corner of a page section, level with the
 *   breadcrumb — the storefront's fixed spot for "act on this whole page".
 * - `inline` puts it in the flow, for a row that already has something on the
 *   left (a breadcrumb, a heading) and would be overlapped by a pinned cluster.
 * - `tile` is the smaller corner cluster on a grid item.
 */
const variants = {
  page: { box: 'absolute top-0 right-0 z-10 flex gap-2', icon: 'h-5 w-5' },
  inline: { box: 'flex shrink-0 gap-2', icon: 'h-5 w-5' },
  tile: { box: 'absolute top-2 right-2 z-10 flex gap-1.5', icon: 'h-4 w-4' },
} as const;

/**
 * The edit-mode edit/delete cluster, wherever the storefront offers one: a page,
 * a category, a product, a grid tile. One component so the pencil and the bin
 * are always the same size, the same distance apart and in the same corner —
 * they were drifting apart across five call sites, and a control that moves
 * between screens reads as a different control.
 *
 * Every affordance is optional: omit `editLink` for a cluster with no editor,
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
      @if (editLink(); as link) {
        <a
          appIconButton
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
