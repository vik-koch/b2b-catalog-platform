import { Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, RouterLink } from '@angular/router';
import { ADMIN_TEXT } from '../../config/admin-text';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { IconButton } from '../../ui/icon-button';

/**
 * One way back to the whole list, wherever a grid puts it: beside the search
 * box on a desktop, in the controls row on a phone.
 *
 * A glyph rather than a labelled button, which is what lets it sit inside the
 * search box's line instead of in the row of actions — where, reserved as an
 * invisible spacer, it used to push "Add customer" a line below the box it was
 * meant to sit beside.
 *
 * Always on screen, and inert until there is something to undo: a control that
 * appears when a filter is applied moves everything beside it at the moment the
 * admin is looking somewhere else. Inert is a real `<button disabled>` rather
 * than a link styled to look spent — the difference is whether it can be tabbed
 * to and pressed, and a spent link can.
 *
 * It clears the narrowing and **keeps the ordering**, which is the only reading
 * that matches the word on it: a sort is not a filter, it is how what is left
 * is arranged. That also settles the other half — the control stays inert while
 * only the sort has been changed, because there is then nothing it would undo.
 * The sort is read off the route rather than passed in, so the two places this
 * control appears cannot disagree about it.
 */
@Component({
  selector: 'app-grid-clear-filters',
  imports: [RouterLink, AdminIcon, IconButton],
  template: `
    @if (filtered()) {
      <a
        appIconButton
        variant="danger"
        routerLink="."
        [queryParams]="keep()"
        [attr.aria-label]="common.clearFilters"
        [title]="common.clearFilters"
      >
        <app-admin-icon name="funnel-x" />
      </a>
    } @else {
      <button
        appIconButton
        type="button"
        disabled
        class="opacity-40"
        [attr.aria-label]="common.clearFilters"
        [title]="common.clearFilters"
      >
        <app-admin-icon name="funnel-x" />
      </button>
    }
  `,
})
export class GridClearFilters {
  protected readonly common = inject(ADMIN_TEXT).common;

  /** Whether anything — a filter, a chip, the search box — is narrowing the
   * list, which is the only state in which there is something to clear. */
  readonly filtered = input(false);

  /** The live query, not a snapshot: this control outlives every navigation
   * the grid makes, and a snapshot would keep offering the first sort forever. */
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);

  /** Everything goes but the ordering, which the URL keeps as it was. */
  protected readonly keep = computed<Params>(() => {
    const sort = this.query()?.get('sort');
    return sort ? { sort } : {};
  });
}
