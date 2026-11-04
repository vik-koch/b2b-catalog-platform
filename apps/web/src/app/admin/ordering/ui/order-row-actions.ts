import { Component, computed, inject, input, output } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import {
  allowedTransitions,
  OrderStatus,
} from '@b2b-catalog-platform/shared/core/ordering';
import { ADMIN_TEXT } from '../../../platform/config/admin-text';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { StaffOrderSummary } from '@b2b-catalog-platform/shared/admin/ordering';
import { circleCheckIcon } from '@b2b-catalog-platform/ui/icons/glyphs/circle-check';
import { circleSlashIcon } from '@b2b-catalog-platform/ui/icons/glyphs/circle-slash';
import { pencilIcon } from '@b2b-catalog-platform/ui/icons/glyphs/pencil';

/** One order's list actions, as a table cell or a card's foot. Not a pencil and
 * a bin: orders are never deleted, and a bin standing for declining would one
 * day be clicked to tidy a list. */
@Component({
  selector: 'app-order-row-actions',
  imports: [RouterLink, Icon, IconButton],
  host: { class: 'flex items-center justify-end gap-2 sm:gap-1' },
  template: `
    <!-- One page; on an unanswered row the glyph is an accent check, a decision
         rather than a correction. -->
    <a
      [routerLink]="['/admin/orders', order().reference]"
      [queryParams]="returnParams()"
      uiIconButton
      [variant]="answerable() ? 'marked' : 'default'"
      [attr.aria-label]="answerable() ? text.actions.answer : text.actions.open"
      [title]="answerable() ? text.actions.answer : text.actions.open"
    >
      <ui-icon [glyph]="answerable() ? circleCheckIcon : pencilIcon" />
    </a>

    <!-- Declined while requested, cancelled once taken on, nothing once ended.
         -->
    @if (!locked() && ending(); as ending) {
      <button
        type="button"
        uiIconButton
        variant="danger"
        [attr.aria-label]="endingLabel()"
        [title]="endingLabel()"
        (click)="endRequested.emit({ order: order(), to: ending })"
      >
        <ui-icon [glyph]="circleSlashIcon" />
      </button>
    }
  `,
})
export class OrderRowActions {
  protected readonly circleCheckIcon = circleCheckIcon;
  protected readonly circleSlashIcon = circleSlashIcon;
  protected readonly pencilIcon = pencilIcon;
  protected readonly text = inject(ADMIN_TEXT).orders.detail;

  readonly order = input.required<StaffOrderSummary>();
  /** So the order page returns to this list, filters and all. */
  readonly returnParams = input<Params>({});
  /** Under an external system (FR-ADM-10) only the way in stays: no decision
   * glyph, no stop. */
  readonly locked = input(false);

  readonly endRequested = output<{
    order: StaffOrderSummary;
    to: OrderStatus;
  }>();

  protected readonly unanswered = computed(
    () => this.order().status === 'requested',
  );
  protected readonly answerable = computed(
    () => this.unanswered() && !this.locked(),
  );

  /** From the shared transition table, not a status list kept here. */
  protected readonly ending = computed<OrderStatus | null>(() => {
    const moves = allowedTransitions('staff', this.order().status);
    if (this.unanswered())
      return moves.includes('declined') ? 'declined' : null;
    return moves.includes('cancelled') ? 'cancelled' : null;
  });

  protected endingLabel(): string {
    return this.ending() === 'declined'
      ? this.text.actions.decline
      : this.text.actions.cancel;
  }
}
