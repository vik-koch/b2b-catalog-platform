import type { DeepReadonly } from '@b2b-catalog-platform/shared/platform';
import {
  ORDERING_AREA,
  paymentMethodLabels,
} from '@b2b-catalog-platform/shared/core/ordering';
import * as z from 'zod';
import { type MailText, mailTextBlock } from '../../../platform/mail/mail-text';

/** What one status says: the line at the top, and the line under it. */
const statusMailText = z
  .object({ heading: z.string(), body: z.string() })
  .strict();

/** Ordering's block of `texts/mail.json`: one section per message. */
export const orderingMailTextShape = {
  /** What the staff order mails call an order's parts, where staff read
   * them differently from customers — the admin has the same words. */
  orders: z
    .object({
      account: z.string(),
      /** An order placed without an account. */
      guest: z.string(),
      items: z.string(),
      paymentMethods: paymentMethodLabels,
    })
    .strict(),
  /**
   * Sent to the customer when an order request arrives (FR-NOTIF-06). It is
   * a receipt for a request, never a confirmation of a sale — a manager
   * still answers it — and it carries the link that opens the order without
   * signing in, which for a guest is the only record they have.
   */
  orderReceived: z
    .object({
      subject: z.string(),
      preheader: z.string(),
      heading: z.string(),
      /** Confirms the request arrived; `{reference}` is substituted. */
      body: z.string(),
      /** What happens next: a person reads it and comes back. */
      nextSteps: z.string(),
      /** Button to the order summary the link opens. */
      action: z.string(),
    })
    .strict(),
  /**
   * Sent to the shop when an order request arrives (FR-NOTIF-05). Staff are
   * the ones who answer it, so this one links into the admin order view.
   */
  newOrder: z
    .object({
      subject: z.string(),
      preheader: z.string(),
      heading: z.string(),
      body: z.string(),
      action: z.string(),
    })
    .strict(),
  /**
   * Sent to the shop when a customer calls their own order off
   * (FR-NOTIF-07). The one move a customer has, and the shop's cue to stop
   * packing — so it is a mail and not a queue: by the time somebody opens
   * the panel the box may already be on the van.
   */
  orderCancelled: z
    .object({
      /** The reference is appended, as on every other order mail. */
      subject: z.string(),
      preheader: z.string(),
      heading: z.string(),
      body: z.string(),
      /** Precedes the reason the customer gave, where they gave one. */
      reasonLabel: z.string(),
      /** Where they gave none: asking for one is a courtesy, not a
       * condition, so its absence is normal and says so. */
      reasonNone: z.string(),
      /** What the shop may still be holding: the money, where a payment was
       * recorded before the order was called off. A refund is arranged
       * outside the platform (FR-ORD-04), so this line is the only prompt
       * anybody gets. */
      paidNote: z.string(),
      itemsHeading: z.string(),
      action: z.string(),
    })
    .strict(),
  /**
   * Sent to the customer whenever their order moves (FR-NOTIF-03).
   *
   * One mail with a heading and a body per state, rather than a template per
   * state: everything around the words — the reference, the total, the link
   * back — is the same in all of them, and a shop rewording its acceptance
   * should not have to be told which of seven files to open.
   *
   * `ready` appears twice because it reads two ways: a collected order is
   * ready to be picked up, a delivered one is on its way. It is one state
   * (ADR 0050) and two sentences.
   */
  orderStatusChanged: z
    .object({
      /** The reference is appended, as on every other order mail. */
      subject: z.string(),
      preheader: z.string(),
      /** Said first wherever a mail carries changes: the reader has to know
       * the order itself moved before being told where it stands. */
      changedIntro: z.string(),
      /** Said first where the message is the shop walking the order back a
       * step (FR-ORD-02). Without it the mail would announce a state the
       * customer was already past as though it were the next one. */
      correctedIntro: z.string(),
      /** Said where the shop's payment instructions travel with the
       * message (FR-ORD-05). Only then: a mail that promised an attachment
       * it does not carry is worse than one that says nothing. */
      attachedNote: z.string(),
      action: z.string(),
      statuses: z
        .object({
          /** An order the shop had ended and has put back in its queue —
           * the only way a move lands on `requested`. */
          reopened: statusMailText,
          /** A message about the order having *changed*, where nothing about
           * it moved (FR-ORD-03). It needs a heading of its own: every other
           * entry here announces a step, and there was no step. */
          changed: statusMailText,
          approved: statusMailText,
          readyDelivery: statusMailText,
          readyPickup: statusMailText,
          completed: statusMailText,
          declined: statusMailText,
          cancelled: statusMailText,
        })
        .strict(),
    })
    .strict(),
  /**
   * The message a supplied document sends on its own (FR-ORD-05).
   *
   * Its own section because it is its own kind of message: nothing about the
   * order changed, and a mail that borrowed the status wording would
   * announce a step that never happened.
   */
  orderDocument: z
    .object({
      /** The reference is appended, as on every other order mail. */
      subject: z.string(),
      preheader: z.string(),
      action: z.string(),
      /** One entry per kind: what arrived, said in the way that kind of
       * document is talked about. */
      kinds: z
        .object({
          paymentInstructions: statusMailText,
          orderSummary: statusMailText,
        })
        .strict(),
    })
    .strict(),
};

export type OrderingMailText = DeepReadonly<
  z.infer<z.ZodObject<typeof orderingMailTextShape>>
>;

/** The block from the whole mail text, which is checked at boot. */
export function orderingMail(text: MailText): OrderingMailText {
  return mailTextBlock<OrderingMailText>(text, ORDERING_AREA);
}
