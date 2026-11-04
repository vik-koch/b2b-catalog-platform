import { fillText } from '@b2b-catalog-platform/shared/platform';
import {
  AdminOrderDetail,
  allowedTransitions,
  moveDirection,
  nextPaymentState,
  notifyByDefault,
  ORDER_STATUS_REASON_MAX,
  OrderStatus,
  transitionHasReason,
} from '@b2b-catalog-platform/shared/core/ordering';
import {
  ConfirmAnswer,
  ConfirmCheck,
} from '@b2b-catalog-platform/ui/overlay/confirm-dialog';
import {
  confirmRequest,
  ConfirmRequest,
  ReasonRequest,
} from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { Glyph } from '@b2b-catalog-platform/ui/icons/glyph';
import { arrowLeftIcon } from '@b2b-catalog-platform/ui/icons/glyphs/arrow-left';
import { arrowRightIcon } from '@b2b-catalog-platform/ui/icons/glyphs/arrow-right';
import { circleSlashIcon } from '@b2b-catalog-platform/ui/icons/glyphs/circle-slash';
import { AdminText } from '../../platform/config/admin-text.type';

type DetailText = AdminText['orders']['detail'];

/** A move's three choices, keyed to read the answer back. */
export const SHOW_CUSTOMER = 'showCustomer';
export const NOTIFY = 'notify';
export const MARK_PAID = 'markPaid';

/** One move the order page offers. */
export interface StaffMove {
  to: OrderStatus;
  label: string;
  icon: Glyph;
  variant: 'primary' | 'secondary' | 'dangerOutline';
}

/** Whether a move runs back up the chain: staff's undo. The button's name and
 * weight, the mail and the notify tick all read this. */
function backwards(from: OrderStatus, to: OrderStatus): boolean {
  return moveDirection(from, to) === 'backward';
}

/**
 * The staff transition table, narrowed to what has an endpoint (an adjustment
 * is its own) and to better words: a request is declined, not cancelled.
 * Erased is final (NFR-LEGAL-14).
 */
export function staffMoves(
  order: AdminOrderDetail,
  text: DetailText,
): StaffMove[] {
  if (order.personalDataRemovedAt) return [];
  return allowedTransitions('staff', order.status)
    .filter((to) => !(to === 'cancelled' && order.status === 'requested'))
    .map((to) => {
      const ending = transitionHasReason(to);
      const back = backwards(order.status, to);
      return {
        to,
        label: moveLabel(order, to, text),
        // The glyph says which way; ending marks match the list's. A
        // correction is drawn quietly.
        icon: ending ? circleSlashIcon : back ? arrowLeftIcon : arrowRightIcon,
        variant: ending ? 'dangerOutline' : back ? 'secondary' : 'primary',
      };
    });
}

/** Named by direction: "Back to confirmed" undoes a click, "Confirm" answers
 * the order. */
export function moveLabel(
  order: AdminOrderDetail,
  to: OrderStatus,
  text: DetailText,
): string {
  const actions = text.actions;
  if (backwards(order.status, to)) {
    return {
      requested: actions.backToRequested,
      approved: actions.backToApproved,
      ready: actions.backToReady,
    }[to as 'requested' | 'approved' | 'ready'];
  }
  return {
    requested: actions.reopen,
    approved: actions.approve,
    // Read through fulfilment, as the badge is.
    ready:
      order.fulfilmentMethod === 'pickup' ? actions.readyPickup : actions.ready,
    completed: actions.complete,
    declined: actions.decline,
    cancelled: actions.cancel,
  }[to];
}

/**
 * The confirmation for a move: its ticks (their page, the mail, and on
 * handover the money), preset and never inferred, as a mail cannot be taken
 * back and a side-effect payment is forgotten. The two endings ask why: the
 * mail quotes it.
 */
export function moveRequest(
  order: AdminOrderDetail,
  to: OrderStatus,
  text: DetailText,
): ConfirmRequest | ReasonRequest {
  const actions = text.actions;
  const label = moveLabel(order, to, text);
  const note = paymentNote(order, to, text);
  const checks: ConfirmCheck[] = [
    {
      key: SHOW_CUSTOMER,
      label: actions.showCustomer,
      hint: actions.showCustomerHint,
      checked: true,
    },
    {
      key: NOTIFY,
      label: actions.notify,
      hint: note ? `${text.notifyHint} ${note}` : text.notifyHint,
      checked: notifyByDefault(order.status, to, order.notifiedStatuses),
      requires: SHOW_CUSTOMER,
    },
  ];
  // Only with money owed and a handover; clearing a mis-tick stays the payment
  // row's job.
  if (order.paymentState !== 'paid' && !transitionHasReason(to)) {
    checks.push({
      key: MARK_PAID,
      label: actions.markPaid,
      hint: actions.markPaidHint,
      // Cash is paid at the handover; other methods may be owed for weeks.
      checked: to === 'completed' && order.paymentMethod === 'cash',
    });
  }
  const asked: ConfirmRequest = {
    ...confirmRequest(actions.confirm),
    heading: fillText(actions.confirm.heading, { action: label }),
    confirmLabel: fillText(actions.confirm.confirm, { action: label }),
    checks,
    // Ending a paid order is allowed, but nothing refunds (FR-ORD-04); the
    // customer's cancel says the same.
    warning:
      order.paymentState === 'paid' && transitionHasReason(to)
        ? actions.confirm.warning
        : undefined,
  };
  return transitionHasReason(to)
    ? {
        ...asked,
        reasonLabel: actions.reasonLabel,
        reasonMaxLength: ORDER_STATUS_REASON_MAX,
      }
    : { ...asked, confirmVariant: 'primary' };
}

/** The confirmed answer as the transition call's options. */
export function moveOptions(answer: ConfirmAnswer): {
  showCustomer: boolean;
  notify: boolean;
  markPaid: boolean;
} {
  return {
    showCustomer: answer.checks[SHOW_CUSTOMER] ?? true,
    notify: answer.checks[NOTIFY] ?? false,
    markPaid: answer.checks[MARK_PAID] ?? false,
  };
}

/** What the dialog says about payment: whether the slip rides along, from
 * `nextPaymentState`, the server's rule. `approved` on an invoiced order is the
 * case: one message that accepts and says how to pay (FR-ORD-05). */
function paymentNote(
  order: AdminOrderDetail,
  to: OrderStatus,
  text: DetailText,
): string | null {
  const owing =
    nextPaymentState(order.paymentState, order.paymentMethod, to) ===
    'awaiting';
  if (!owing) return null;
  const supplied = order.documents.some(
    (document) =>
      document.kind === 'payment-instructions' &&
      document.source === 'supplied',
  );
  // No slip is worth noticing before the customer is told they owe.
  return supplied
    ? text.actions.notifyAttachment
    : text.actions.notifyNoDocument;
}
