import type { DeepReadonly } from '@b2b-catalog-platform/shared/platform';
import {
  orderStatusLabels,
  paymentMethodLabels,
  paymentStateLabels,
} from '@b2b-catalog-platform/shared/core/ordering';
import * as z from 'zod';
import { confirmText, pageText } from '../../platform/config/text-shapes';

/** Ordering's block of `texts/admin.json`. */
export const adminOrderingTextShape = {
  /** The staff order screens, and what they all say alike. */
  orders: z
    .object({
      notFound: z.string(),
      loadError: z.string(),
      /** Which price list an order came from. A null key is the storefront's
       * list, named generically as it may have changed since. */
      tier: z.string(),
      tierDefault: z.string(),
      /** What staff call an order's parts, beside the shared names. Their
       * own words where the customer's are written for the customer. */
      account: z.string(),
      /** An order placed without an account. */
      guest: z.string(),
      items: z.string(),
      note: z.string(),
      pickupPoint: z.string(),
      /** The accepted terms as the page editor numbers them: `{version}`
       * and `{date}`. */
      termsVersion: z.string(),
      statuses: orderStatusLabels,
      paymentMethods: paymentMethodLabels,
      /** One state more than a customer reads: a cash order nobody has
       * ticked yet. */
      paymentStates: paymentStateLabels
        .extend({ cashOnHandover: z.string() })
        .strict(),
      /** The staff order list (FR-AUTH-03), read-only: a manager answers by
       * phone or mail. */
      list: z
        .object({
          page: pageText,
          /** How many rows the list holds, filters applied. */
          count: z.string(),
          searchAria: z.string(),
          searchPlaceholder: z.string(),
          clearSearch: z.string(),
          empty: z.string(),
          /** Shown instead of `empty` when the status filter emptied the
           * list. */
          noResults: z.string(),
          loadError: z.string(),
          /** Column headings; the rest are shared names. */
          placed: z.string(),
          customer: z.string(),
          items: z.string(),
          filterStatus: z.string(),
          statusAll: z.string(),
          /** Whether anything is owed (FR-ORD-04), read apart from the
           * status. An order with nothing due says nothing. */
          filterPayment: z.string(),
          paymentAll: z.string(),
          /** Everything unpaid, cash and invoiced, where the panel's
           * finished-and-unpaid count leads. */
          paymentUnpaid: z.string(),
          /** Screen-reader heading for the column of row buttons. */
          actionsAria: z.string(),
          /** `{count}` lines on the order. */
          itemCount: z.string(),
        })
        .strict(),
      /** One order in full, as staff read it. */
      detail: z
        .object({
          /** `{date}` the request was sent, and `{date}` its status last moved. */
          placed: z.string(),
          back: z.string(),
          /** Opens the summary a guest was mailed (FR-NOTIF-06), what they see
           * when they ring. An account holder's view is the version link. */
          guestView: z.string(),
          /** The block wording not shared with the storefront. */
          billingSame: z.string(),
          whenAny: z.string(),
          /** The line under every "email the customer" tick: what they are sent. */
          notifyHint: z.string(),
          /** A line in pieces, `{count} × {price}`, as the source system
           * prices. */
          pieceLine: z.string(),
          /** Every version of the order (FR-ORD-03): what the shop said it
           * changed, and the difference from the version before it. */
          revisions: z
            .object({
              heading: z.string(),
              /** `{count}` versions, on the lid of the panel. */
              subheading: z.string(),
              /** `{number}` of the version, `{date}` it was written and
               * `{who}` wrote it. */
              written: z.string(),
              /** Version 1 is the order as it was sent, so nobody on the
               * shop's side wrote it. */
              authorCustomer: z.string(),
              /** A later version without an author: an outside system, or
               * an old record. */
              authorUnknown: z.string(),
              /** What each version was written for: the customer sent it, the
               * shop moved the order, or the shop changed what it says. */
              submitted: z.string(),
              moved: z.string(),
              changed: z.string(),
              /** Marks the version the customer is being shown. */
              customerView: z.string(),
              changes: z.string(),
              noChanges: z.string(),
              loadError: z.string(),
              /** The version's name, `{number}`, linking to its page, with who
               * wrote it and when beside it. */
              versionLabel: z.string(),
              /** The same name inside a sentence, `{number}`, lower-cased where
               * the language wants it. */
              versionInline: z.string(),
              writtenBy: z.string(),
              /** Which version the customer is on, where this is not it. */
              customerOn: z.string(),
              /** When the customer was written to about it (FR-NOTIF-03),
               * `{date}`. */
              notified: z.string(),
              /** The way from reading a version to answering the order, and
               * back the other way. */
              openControls: z.string(),
              /** The same link where there is nothing to answer with, because
               * an external system holds order processing. */
              openOrder: z.string(),
              openRevision: z.string(),
            })
            .strict(),
          /** Answering an order (FR-ORD-01/02/04): a label per move, and the
           * two refusals ask why, as the customer is quoted it. */
          actions: z
            .object({
              /** The list's own two glyphs: opening an order, and opening one
               * that has not been answered yet. */
              open: z.string(),
              answer: z.string(),
              approve: z.string(),
              /** Opening the adjustment form (FR-ORD-03): accepting something
               * other than what was submitted. */
              adjust: z.string(),
              /** Undo an ending: back to a request the shop has to answer. */
              reopen: z.string(),
              /** Staff's undo along the chain, worded apart: "Confirm" on an
               * order out for delivery reads as a step forward. */
              backToRequested: z.string(),
              backToApproved: z.string(),
              backToReady: z.string(),
              ready: z.string(),
              readyPickup: z.string(),
              complete: z.string(),
              decline: z.string(),
              cancel: z.string(),
              /** The tick that decides whether the move reaches the
               * customer's own page (FR-NOTIF-03), and the line under it.
               * Offered ticked: clearing it is for a step taken by
               * mistake. */
              showCustomer: z.string(),
              showCustomerHint: z.string(),
              /** The tick that decides whether the move puts a message in the
               * customer's inbox (FR-NOTIF-03), and the line under it.
               * Offered ticked for news they have not had yet, and only where
               * the move reaches their page at all. */
              notify: z.string(),
              /** The tick that records the money with the move that is the
               * handover (FR-ORD-04), and the line under it. */
              markPaid: z.string(),
              markPaidHint: z.string(),
              reasonLabel: z.string(),
              /**
               * `{action}` names the move, in the heading and on the button.
               * The warning is weighed before ending an order the shop has
               * already been paid for (FR-ORD-04): the move goes ahead, but
               * nothing here sends money back, and this is where somebody
               * would assume it does.
               */
              confirm: confirmText,
              /** Added to the dialog where the shop's payment instructions
               * will travel with the message this move sends (FR-ORD-05). */
              notifyAttachment: z.string(),
              /** And where they would have, had anybody filed them: the move
               * that makes the money due is the last comfortable moment to
               * notice the slip is missing. */
              notifyNoDocument: z.string(),
              /** The move was refused: the order had already been
               * answered. */
              error: z.string(),
            })
            .strict(),
          /**
           * Telling the customer where the order has got to (FR-NOTIF-03), on
           * the one row that exists because it is a decision: their view of
           * the order has moved on without a word about it, and nothing
           * writes to them on its own.
           */
          /** What the customer can see and was told, always answered:
           * "nothing to do" is an answer too (FR-NOTIF-03). */
          tellCustomer: z
            .object({
              heading: z.string(),
              /** `{current}` where their page is level with the order. */
              on: z.string(),
              /** `{seen}` the version they are on and `{current}` the one the
               * order stands on. Both are filled with
               * `revisions.versionInline`, so the sentence carries the word
               * and this the punctuation. */
              behind: z.string(),
              /** The second line: whether a message has ever gone out, and
               * about which version (`{notified}`). */
              emailedNever: z.string(),
              emailedOn: z.string(),
              /** Moving their page on to the version the order stands on. The
               * message is a tick on it, not a second button. */
              update: z.string(),
              updateConfirm: confirmText,
              updateNotify: z.string(),
              /** Writing about the version they hold: a message decided
               * against, or one that never arrived. */
              email: z.string(),
              emailAgain: z.string(),
              emailConfirm: confirmText,
              /** Somebody else moved the order while this page was open. */
              error: z.string(),
            })
            .strict(),
          /** Recording that the money arrived; the platform takes no
           * payment. */
          paymentState: z
            .object({
              /** `{date}` it was recorded. */
              paid: z.string(),
              record: z.string(),
              recordConfirm: confirmText,
              /** Taking the record back: a mis-tick, never a refund. */
              clear: z.string(),
              clearConfirm: confirmText,
              error: z.string(),
            })
            .strict(),
          /**
           * The personal details on the order (NFR-LEGAL-14): when they were
           * removed, or on a finished guest order, removing them on the
           * guest's request.
           */
          personalData: z
            .object({
              heading: z.string(),
              /** A finished guest order that still carries them. */
              kept: z.string(),
              /** `{date}` they were removed. */
              removed: z.string(),
              remove: z.string(),
              confirm: confirmText,
              error: z.string(),
            })
            .strict(),
          /** The two documents an order carries (FR-ORD-05). */
          documents: z
            .object({
              heading: z.string(),
              summary: z.string(),
              paymentInstructions: z.string(),
              /** Said of the summary nobody has replaced. */
              generated: z.string(),
              /** `{date}` a file was supplied. */
              supplied: z.string(),
              /** A supplied file quoting an order that has changed since:
               * `{number}` it was filed against, `{current}` where the order
               * is now. A warning, never a refusal. */
              outdated: z.string(),
              open: z.string(),
              upload: z.string(),
              replace: z.string(),
              notify: z.string(),
              notifyHint: z.string(),
              /** Why the send button is not offered: the customer's own page
               * has not reached the version the file was filed against. */
              notifyBehind: z.string(),
              /** The button afterwards, still pressable: a customer who lost
               * the message asks again. */
              notifySent: z.string(),
              notifyConfirm: confirmText,
              /** Why staff cannot draw payment instructions themselves. */
              paymentHint: z.string(),
              summaryHint: z.string(),
              removeConfirm: confirmText,
              error: z.string(),
            })
            .strict(),
        })
        .strict(),
      /** Adjusting an order (FR-ORD-03): a new version on one screen, apart
       * from the detail screen, as this one asks. */
      adjust: z
        .object({
          page: pageText,
          save: z.string(),
          cancel: z.string(),
          /** Warnings, not refusals: a change is allowed wherever the order
           * stands, and the screen says what it will sit awkwardly with. */
          warnPaid: z.string(),
          warnReady: z.string(),
          warnEnded: z.string(),
          /** Whether to write to the customer about this change now
           * (FR-NOTIF-03). Off by default: the move that follows carries the
           * news, and this is for the change no move will ever mention. */
          notify: z.string(),
          notifyHint: z.string(),
          lines: z
            .object({
              /** The staff reading of a quantity: how many of what the price
               * is per (FR-UNIT-04). */
              unitsAria: z.string(),
              priceAria: z.string(),
              removeAria: z.string(),
              /** Reordering a line, for a picking list read top down;
               * removing and re-adding would lose its agreed price. */
              moveUpAria: z.string(),
              moveDownAria: z.string(),
              addLabel: z.string(),
              addPlaceholder: z.string(),
              noMatches: z.string(),
              /** `{count}`, for the live region. */
              suggestionCountAria: z.string(),
              empty: z.string(),
              /** A line priced off its list (FR-CART-09): allowed, and said. */
              offList: z.string(),
            })
            .strict(),
          /** Who the order is invoiced to; the fields themselves are shared
           * names. */
          partyKindPerson: z.string(),
          partyKindCompany: z.string(),
          reprice: z.string(),
          /** The second half of the form, which folds away from the first:
           * who the order goes to and how it is paid. */
          detailsHeading: z.string(),
          billingAddress: z.string(),
          /** The customer's own words, shown and not editable. */
          customerHeading: z.string(),
          /** The day they asked for: `{date}`, or the words for any day. */
          wished: z.string(),
          customerNone: z.string(),
          noteHint: z.string(),
          noteRequired: z.string(),
          /** What is about to change, line by line (FR-ORD-03). */
          changes: z
            .object({
              heading: z.string(),
              none: z.string(),
              /** Why the priced half of the comparison is missing. */
              pricingPending: z.string(),
            })
            .strict(),
          /** What the manager should not have to spot for themselves before
           * signing an adjustment off: `{count}` prices moved from the
           * version on file, and `{count}` priced away from `{tier}`. */
          priceNotice: z
            .object({
              moved: z.string(),
              offList: z.string(),
            })
            .strict(),
          confirm: confirmText,
          errors: z
            .object({
              'order-changed': z.string(),
              'no-change': z.string(),
              'unknown-product': z.string(),
              'unknown-tier': z.string(),
              'invalid-company-id': z.string(),
              'unsupported-country': z.string(),
              'invalid-postal-code': z.string(),
              'unknown-pickup-location': z.string(),
              'billing-details-required': z.string(),
              'cash-not-available': z.string(),
              'billing-address-required': z.string(),
              /** The party is a kind of customer the shop does not sell to
               * (FR-AUTH-13). */
              'customer-type-not-accepted': z.string(),
              'order-not-found': z.string(),
              /** Anything else: a network that dropped, a server that fell over. */
              unknown: z.string(),
            })
            .strict(),
        })
        .strict(),
      /** Row labels for an order's changes, on the adjustment screen and
       * between versions. The total is a shared name. */
      changes: z
        .object({
          line: z.string(),
          added: z.string(),
          removed: z.string(),
          /** The packing estimate where products carry one: what the shop
           * books a van by. */
          shipment: z.string(),
        })
        .strict(),
    })
    .strict(),
  /**
   * Where order processing is owned by an automated source (FR-ADM-10):
   * closed whole like the customers, so one banner on every order screen
   * that carries controls. The adjustment form draws itself dead rather than
   * not at all, as the order is still worth reading.
   */
  ownership: z.object({ orderLocked: z.string() }).strict(),
};

export type AdminOrderingText = DeepReadonly<
  z.infer<z.ZodObject<typeof adminOrderingTextShape>>
>;
