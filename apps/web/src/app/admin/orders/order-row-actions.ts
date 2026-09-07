import { Component, computed, inject, input, output } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import {
  allowedTransitions,
  TransitionTarget,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { IconButton } from '../../ui/icon-button';
import { StaffOrderSummary } from './orders.service';

/**
 * What can be done to one order from the list, drawn once for both shapes it
 * appears in — a table cell on a desktop, the foot of a card on a phone.
 *
 * Deliberately **not** a pencil and a bin. Orders are never deleted (ADR
 * 0050): the destructive answer to an order is declining or cancelling it, and
 * a bin standing for either would one day be clicked by somebody who meant to
 * tidy a list. What the two slots carry is the same shape the account list
 * uses — open it, and stop it — with the meaning the row's own state gives
 * them.
 */
@Component({
  selector: 'app-order-row-actions',
  imports: [RouterLink, AdminIcon, IconButton],
  host: { class: 'flex items-center justify-end gap-2 sm:gap-1' },
  template: `
    <!-- Both open the same page; only the glyph differs, because on an
         unanswered row the job is a decision and not a correction. The check
         carries the accent colour so intent reads at a glance down a column of
         grey pencils — the same rule the account list follows. -->
    <a
      [routerLink]="['/admin/orders', order().reference]"
      [queryParams]="returnParams()"
      appIconButton
      [variant]="unanswered() ? 'marked' : 'default'"
      [attr.aria-label]="unanswered() ? text.actions.answer : text.actions.open"
      [title]="unanswered() ? text.actions.answer : text.actions.open"
    >
      <app-admin-icon [name]="unanswered() ? 'circle-check' : 'pencil'" />
    </a>

    <!-- One slot for "stop this order", with the word the row's state gives
         it: a request the shop will not fill is declined, an order it has
         already taken on is cancelled. An order that has ended has neither. -->
    @if (ending(); as ending) {
      <button
        type="button"
        appIconButton
        variant="danger"
        [attr.aria-label]="endingLabel()"
        [title]="endingLabel()"
        (click)="endRequested.emit({ order: order(), to: ending })"
      >
        <app-admin-icon name="circle-slash" />
      </button>
    }
  `,
})
export class OrderRowActions {
  protected readonly text = inject(ADMIN_TEXT).orderDetail;

  readonly order = input.required<StaffOrderSummary>();
  /** So the order page opened from a row returns to this list, filters and
   * all. */
  readonly returnParams = input<Params>({});

  readonly endRequested = output<{
    order: StaffOrderSummary;
    to: TransitionTarget;
  }>();

  protected readonly unanswered = computed(
    () => this.order().status === 'requested',
  );

  /**
   * The way this order can be stopped, read off the shared transition table
   * rather than off a list of statuses kept here: an unanswered request is
   * declined, everything the shop has taken on is cancelled, and an order that
   * has ended offers nothing at all.
   */
  protected readonly ending = computed<TransitionTarget | null>(() => {
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
