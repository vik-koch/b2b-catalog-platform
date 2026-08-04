import { Component, computed, input, output } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { IconButton } from '../ui/icon-button';
import { LucideIcon } from '../ui/icons/lucide-icon';

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
 * Either affordance is optional: omit `editLink` for delete-only, omit
 * `deleteLabel` for a page that cannot be deleted (a static page, the catalogue
 * root). Rendering is the caller's decision — the cluster assumes edit mode is
 * already on and the wording already loaded.
 */
@Component({
  selector: 'app-edit-actions',
  imports: [RouterLink, IconButton, LucideIcon],
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
          <app-lucide-icon name="pencil" [class]="style().icon" />
        </a>
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
          <app-lucide-icon name="trash-2" [class]="style().icon" />
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

  protected readonly style = computed(() => variants[this.variant()]);
}
