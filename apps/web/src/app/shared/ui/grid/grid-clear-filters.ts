import { Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, RouterLink } from '@angular/router';
import { GRID_TEXT } from './grid-text';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { IconButton } from '../icon-button';
import { funnelXIcon } from '@b2b-catalog-platform/ui/icons/glyphs/funnel-x';

/**
 * Back to the whole list: a glyph, so it sits on the search box's line. Always
 * on screen and a real `<button disabled>` until there is something to undo,
 * so nothing beside it moves. It keeps the sort, which is no filter, and reads
 * it off the route, so its two places cannot disagree.
 */
@Component({
  selector: 'app-grid-clear-filters',
  imports: [RouterLink, Icon, IconButton],
  template: `
    @if (filtered()) {
      <a
        appIconButton
        variant="danger"
        routerLink="."
        [queryParams]="keep()"
        [attr.aria-label]="gridText.clearFilters"
        [title]="gridText.clearFilters"
      >
        <app-icon [glyph]="funnelXIcon" />
      </a>
    } @else {
      <button
        appIconButton
        type="button"
        disabled
        class="opacity-40"
        [attr.aria-label]="gridText.clearFilters"
        [title]="gridText.clearFilters"
      >
        <app-icon [glyph]="funnelXIcon" />
      </button>
    }
  `,
})
export class GridClearFilters {
  protected readonly funnelXIcon = funnelXIcon;
  protected readonly gridText = inject(GRID_TEXT);

  /** Whether anything narrows the list, the search included. */
  readonly filtered = input(false);

  /** The live query: a snapshot would keep the first sort forever. */
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);

  /** Everything goes but the ordering, which the URL keeps as it was. */
  protected readonly keep = computed<Params>(() => {
    const sort = this.query()?.get('sort');
    return sort ? { sort } : {};
  });
}
