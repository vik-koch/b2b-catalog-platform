import { ADMIN_ACCOUNTS_TEXT } from '../accounts-text';
import { Component, inject, input, output } from '@angular/core';
import { RouterLink, Params } from '@angular/router';
import { ADMIN_TEXT } from '../../../platform/config/admin-text';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { circleCheckIcon } from '@b2b-catalog-platform/ui/icons/glyphs/circle-check';
import { circleSlashIcon } from '@b2b-catalog-platform/ui/icons/glyphs/circle-slash';
import { pencilIcon } from '@b2b-catalog-platform/ui/icons/glyphs/pencil';
import { rotateCcwIcon } from '@b2b-catalog-platform/ui/icons/glyphs/rotate-ccw';
import { trash2Icon } from '@b2b-catalog-platform/ui/icons/glyphs/trash-2';
import { StaffUser } from '@b2b-catalog-platform/shared/core/accounts';

/** An account's row actions, drawn in both the table cell and the card. A
 * component, not a template, so the row stays typed. Confirming stays with
 * the list, which reloads after. */
@Component({
  selector: 'app-user-row-actions',
  imports: [RouterLink, Icon, IconButton],
  host: { class: 'flex items-center justify-end gap-2 sm:gap-1' },
  template: `
    <!-- A pending row opens the editor as a decision, in the accent colour. -->
    @if (user().status !== 'anonymized') {
      <a
        [routerLink]="['/admin/users', user().id, 'edit']"
        [queryParams]="returnParams()"
        uiIconButton
        [variant]="user().status === 'pending' ? 'marked' : 'default'"
        [attr.aria-label]="
          user().status === 'pending' ? text.approve : text.edit
        "
      >
        <ui-icon
          [glyph]="user().status === 'pending' ? circleCheckIcon : pencilIcon"
        />
      </a>
    }

    <!-- One slot: decline when pending, switch off, or back on. -->
    @if (user().status === 'pending') {
      <button
        type="button"
        uiIconButton
        variant="danger"
        [attr.aria-label]="text.declineAria"
        (click)="declined.emit(user())"
      >
        <ui-icon [glyph]="trash2Icon" />
      </button>
    } @else if (user().status === 'disabled') {
      <button
        type="button"
        uiIconButton
        [attr.aria-label]="text.reactivateAria"
        (click)="activeChanged.emit({ user: user(), active: true })"
      >
        <ui-icon [glyph]="rotateCcwIcon" />
      </button>
    } @else if (user().status !== 'anonymized') {
      <button
        type="button"
        uiIconButton
        variant="danger"
        [attr.aria-label]="text.deactivateAria"
        (click)="activeChanged.emit({ user: user(), active: false })"
      >
        <ui-icon [glyph]="circleSlashIcon" />
      </button>
    }
  `,
})
export class UserRowActions {
  protected readonly circleCheckIcon = circleCheckIcon;
  protected readonly circleSlashIcon = circleSlashIcon;
  protected readonly pencilIcon = pencilIcon;
  protected readonly rotateCcwIcon = rotateCcwIcon;
  protected readonly trash2Icon = trash2Icon;
  protected readonly text = inject(ADMIN_ACCOUNTS_TEXT).users.list;

  readonly user = input.required<StaffUser>();
  /** The editor returns to this list, filters and all. */
  readonly returnParams = input<Params>({});

  readonly declined = output<StaffUser>();
  readonly activeChanged = output<{ user: StaffUser; active: boolean }>();
}
