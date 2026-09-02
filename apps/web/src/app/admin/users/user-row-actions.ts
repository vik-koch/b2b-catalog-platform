import { Component, inject, input, output } from '@angular/core';
import { RouterLink, Params } from '@angular/router';
import { StaffUser } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { IconButton } from '../../ui/icon-button';

/**
 * What can be done to one account from the list, drawn once for both shapes it
 * appears in — a table cell on a desktop, the foot of a card on a phone.
 *
 * A component rather than a shared `<ng-template>` because the row it is given
 * has a type worth keeping: a template's context is untyped, and the states
 * these buttons switch on are exactly what a typo would get wrong.
 *
 * The decisions stay with the list: both actions here are confirmed, and a
 * confirmation belongs to the screen that reloads afterwards.
 */
@Component({
  selector: 'app-user-row-actions',
  imports: [RouterLink, AdminIcon, IconButton],
  host: { class: 'flex items-center justify-end gap-2 sm:gap-1' },
  template: `
    <!-- Both open the same editor; only the glyph differs, because on a pending
         row the job is a decision and not a correction. The check carries the
         accent colour so that intent reads at a glance down a column of grey
         pencils. -->
    @if (user().status !== 'anonymized') {
      <a
        [routerLink]="['/admin/users', user().id, 'edit']"
        [queryParams]="returnParams()"
        appIconButton
        [variant]="user().status === 'pending' ? 'marked' : 'default'"
        [attr.aria-label]="
          user().status === 'pending' ? text.approve : text.edit
        "
      >
        <app-admin-icon
          [name]="user().status === 'pending' ? 'circle-check' : 'pencil'"
        />
      </a>
    }

    <!-- One slot for "stop this account", with the meaning the row's state
         gives it: an undecided registration is thrown away, an approved account
         is switched off (whether or not its owner ever signed in), and a
         switched-off one is switched back on. -->
    @if (user().status === 'pending') {
      <button
        type="button"
        appIconButton
        variant="danger"
        [attr.aria-label]="text.decline"
        (click)="declined.emit(user())"
      >
        <app-admin-icon name="trash-2" />
      </button>
    } @else if (user().status === 'disabled') {
      <button
        type="button"
        appIconButton
        [attr.aria-label]="text.reactivate"
        (click)="activeChanged.emit({ user: user(), active: true })"
      >
        <app-admin-icon name="rotate-ccw" />
      </button>
    } @else if (user().status !== 'anonymized') {
      <button
        type="button"
        appIconButton
        variant="danger"
        [attr.aria-label]="text.deactivate"
        (click)="activeChanged.emit({ user: user(), active: false })"
      >
        <app-admin-icon name="circle-slash" />
      </button>
    }
  `,
})
export class UserRowActions {
  protected readonly text = inject(ADMIN_TEXT).userList;

  readonly user = input.required<StaffUser>();
  /** So an editor opened from a row returns to this list, filters and all. */
  readonly returnParams = input<Params>({});

  readonly declined = output<StaffUser>();
  readonly activeChanged = output<{ user: StaffUser; active: boolean }>();
}
