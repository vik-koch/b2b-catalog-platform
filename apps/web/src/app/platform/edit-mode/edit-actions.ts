import { Component, computed, input, output } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { DiscButton } from '@b2b-catalog-platform/ui/actions/disc-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { bookCheckIcon } from '@b2b-catalog-platform/ui/icons/glyphs/book-check';
import { bookDashedIcon } from '@b2b-catalog-platform/ui/icons/glyphs/book-dashed';
import { funnelIcon } from '@b2b-catalog-platform/ui/icons/glyphs/funnel';
import { pencilIcon } from '@b2b-catalog-platform/ui/icons/glyphs/pencil';
import { tableIcon } from '@b2b-catalog-platform/ui/icons/glyphs/table';

/** `page`: pinned top right, level with the breadcrumb. `inline`: in the flow
 * of a row that has something on the left. `tile`: smaller, on a grid
 * item's picture. */
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

/** What a `page` cluster takes from the line it is pinned beside, so a long
 * breadcrumb does not run under the discs. */
export const EDIT_ACTIONS_INSET = 'pr-30';

/**
 * The storefront's edit-mode discs, one size, gap and corner everywhere. Each
 * is optional; creating and deleting are the admin lists', which the list disc
 * opens. The caller renders it only in edit mode, with the wording loaded.
 */
@Component({
  selector: 'app-edit-actions',
  imports: [RouterLink, DiscButton, Icon],
  template: `
    <div [class]="style().box">
      <!-- A fixed order, so each disc keeps its place from page to page: the
           list, which leaves the page; the pencil; then the kind's own step. -->
      @for (disc of links(); track disc.glyph) {
        <a
          uiDiscButton
          [size]="style().size"
          [routerLink]="disc.link"
          [queryParams]="disc.params"
          [attr.aria-label]="disc.label"
          [attr.title]="disc.label"
        >
          <ui-icon [glyph]="disc.glyph" [class]="style().icon" />
        </a>
      }
      @if (publishLabel(); as label) {
        <button
          uiDiscButton
          [size]="style().size"
          type="button"
          [attr.aria-label]="label"
          [attr.title]="label"
          (click)="togglePublished.emit()"
        >
          <ui-icon
            [glyph]="published() ? bookDashedIcon : bookCheckIcon"
            [class]="style().icon"
          />
        </button>
      }
    </div>
  `,
})
export class EditActions {
  protected readonly bookCheckIcon = bookCheckIcon;
  protected readonly bookDashedIcon = bookDashedIcon;
  readonly variant = input<keyof typeof variants>('page');
  /** The admin list narrowed to what this page shows. */
  readonly listLink = input<unknown[] | null>(null);
  readonly listParams = input<Params | undefined>(undefined);
  readonly listLabel = input<string>('');
  /** The category's filter panel (FR-ATTR-11). */
  readonly filtersLink = input<unknown[] | null>(null);
  readonly filtersParams = input<Params | undefined>(undefined);
  readonly filtersLabel = input<string>('');

  readonly editLink = input<unknown[] | null>(null);
  readonly editParams = input<Params | undefined>(undefined);
  readonly editLabel = input<string>('');
  /** Products only; the label says what the click will do. */
  readonly publishLabel = input<string | null>(null);
  readonly published = input(false);
  readonly togglePublished = output<void>();

  protected readonly style = computed(() => variants[this.variant()]);

  protected readonly links = computed(() =>
    [
      {
        glyph: tableIcon,
        link: this.listLink(),
        params: this.listParams(),
        label: this.listLabel(),
      },
      {
        glyph: pencilIcon,
        link: this.editLink(),
        params: this.editParams(),
        label: this.editLabel(),
      },
      {
        glyph: funnelIcon,
        link: this.filtersLink(),
        params: this.filtersParams(),
        label: this.filtersLabel(),
      },
    ].filter((disc) => disc.link !== null),
  );
}
