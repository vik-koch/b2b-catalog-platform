import * as z from 'zod';

import type { DeepReadonly } from '@b2b-catalog-platform/shared/platform';

import { confirmText } from '../../platform/config/text-shapes';

/** Ordering's block of `texts/storefront.json`. */
export const storefrontOrderingTextShape = {
  /**
   * The cart: the header control, the buying block on a product page, and
   * the cart page itself (FR-CART-01/02/08, FR-UNIT-07). The cart lives in
   * the browser, so every word here is client-side.
   */
  cart: z
    .object({
      /** The header control's label, and the page's own title. */
      navLabel: z.string(),
      title: z.string(),
      /** The header control's accessible name: `{count}` lines, `{total}`
       * money, in one sentence, as a badge alone says nothing. */
      summaryAria: z.string(),
      empty: z.string(),
      emptyAction: z.string(),
      loadError: z.string(),
      /** The browser refused to store the cart (a full quota, storage off):
       * said rather than losing the cart in silence. */
      storageFailed: z.string(),

      /** The cart page. */
      lineNoteAria: z.string(),
      /** `{name}` is the product. */
      removeAria: z.string(),
      /** A row's tick box, named by the product it selects: `{name}`. */
      selectLineAria: z.string(),
      /** The two controls above the lines. The first toggles: it offers the
       * whole cart until the whole cart is ticked, and giving the ticks back
       * after that. */
      selectAll: z.string(),
      clearSelection: z.string(),
      deleteSelected: z.string(),
      /** `{count}` lines in the message. */
      deleteSelectedConfirm: confirmText,

      /** To the checkout form, and back to the shelf the visitor stood at: the
       * URL's category, page and filters, or the catalogue. */
      checkout: z.string(),
      continueShopping: z.string(),
      /**
       * What changed while the cart waited (FR-CART-10), shown once on
       * return and dismissed with one control. One sentence per line, each
       * naming the product (`{name}`) because the summary is read before the
       * lines it is about.
       */
      changes: z
        .object({
          heading: z.string(),
          /** The control that puts the summary away. */
          dismissAria: z.string(),
          unavailable: z.string(),
          /** The quantity was rounded to one the shop can supply; the line
           * itself shows the figure that stands, so this names none. */
          quantity: z.string(),
          /** `{from}` and `{to}`: the line total before and now, what the
           * customer is about to pay. */
          price: z.string(),
          /** The line can no longer be priced exactly, so it is confirmed by
           * hand instead. */
          unpriced: z.string(),
          /** The shelf emptied, or filled again, while the cart waited
           * (FR-STOCK-04). "Few left" is not reported: it restricts nothing,
           * and the line's own badge states it. */
          outOfStock: z.string(),
          backInStock: z.string(),
        })
        .strict(),

      /** What preview says about a line. `unavailable` covers withdrawn,
       * unpublished and never-existed alike, as the endpoint does. */
      issues: z
        .object({
          unavailable: z.string(),
          /** The product lost the unit the line was read in: the pieces stand,
           * so this reports a move, not a refusal. */
          unitUnavailable: z.string(),
          /** A quantity was rounded to one the shop supplies, here or by the
           * server. No figures: the field shows the one that stands. */
          quantityCorrected: z.string(),
          noteNotAllowed: z.string(),
          priceUnavailable: z.string(),
          /** Listed and priced but not orderable (FR-STOCK-04): the badge says
           * the state, this what it means for the order. */
          outOfStock: z.string(),
        })
        .strict(),
      /**
       * What a cart lacks of what its products are sold with
       * (FR-SET-02/03/04), per line in two halves: `shortAction` is the link
       * to press (`{count}` pieces, `{unit}`), `shortReason` the rest. The
       * split is grammar, so text. In the order card, `summary` advises and
       * `summaryEnforced` stands beside a disabled button.
       */
      pairing: z
        .object({
          shortAction: z.string(),
          shortReason: z.string(),
          summary: z.string(),
          summaryEnforced: z.string(),
        })
        .strict(),
    })
    .strict(),
  /** Checkout and its preview (FR-CART-03/04/07/09). What a choice means
   * is worded here; what a deployment offers (zones, offices) is config. */
  checkout: z
    .object({
      title: z.string(),
      /** One line under the heading, saying what this is: a request a
       * manager confirms, not a purchase being completed. */
      intro: z.string(),
      /** Here with nothing to order: the cart emptied in another tab, or the
       * URL was typed. */
      emptyCart: z.string(),
      /** Offered to a guest beside the figures: a guest pays the default
       * list. An offer, never a gate, as registration waits for a manager. */
      signInPrompt: z.string(),
      signInAction: z.string(),
      /** A signed-in account with no telephone number cannot place an order:
       * the contact block the manager answers from requires one. Said here
       * rather than left to a refusal, which arrives after the review. */
      phoneMissing: z.string(),
      phoneMissingAction: z.string(),
      /** What a guest is asked about themselves (FR-CART-03/09): who is
       * invoiced and how to reach them. A signed-in customer sees none of it:
       * the account answers. */
      contact: z
        .object({
          heading: z.string(),
          /** A private person: the party and the contact are the one name. */
          name: z.string(),
          /** A company: the party is the company, and this is whoever at it
           * we ring about the order. */
          contactName: z.string(),
          nameRequired: z.string(),
          /** What the details are for: a guest hands a phone number to a shop
           * they have no account with. */
          note: z.string(),
        })
        .strict(),
      /** Who is invoiced (FR-CART-09): the account's party or somebody
       * else; the address row asks where the paperwork goes. */
      party: z
        .object({
          heading: z.string(),
          /** The account's own party while its name is unknown: a person is
           * named, not labelled. */
          own: z.string(),
          /** Anybody but the account: one option, the kind of party asked
           * inside, as registration asks it. */
          other: z.string(),
          /** The name of a person being invoiced, which is the whole of what
           * a private party is. */
          personName: z.string(),
          nameRequired: z.string(),
          /** FR-CART-09: a third party's order is priced provisionally,
           * because the price group belongs to the account. Said where the
           * choice is made, not buried in the preview. */
          otherNotice: z.string(),
        })
        .strict(),
      /**
       * Choosing where the goods go and where the invoice goes. One book,
       * two roles: a row is not typed as one or the other.
       */
      addresses: z
        .object({
          deliveryHeading: z.string(),
          billingHeading: z.string(),
          /** Pickup still asks one address: the invoiced party's, not the
           * carrier's. */
          billingOnlyHeading: z.string(),
          /** The checked default: unchecking reveals a second picker. */
          sameAsDelivery: z.string(),
          /** A picker's last option where it has rows; without rows the fields
           * stand alone. */
          addNew: z.string(),
          loadError: z.string(),
          /** Whether to keep a newly typed address for next time. */
          saveToBook: z.string(),
        })
        .strict(),
      /**
       * The delivery zone the entered address falls into (FR-CART-07).
       * Advisory throughout: it never blocks an order and prices nothing.
       */
      zone: z
        .object({
          /** `{zone}`: the configured zone's title. */
          resolved: z.string(),
          /** `{amount}` short of the free-delivery threshold. */
          shortOf: z.string(),
          /** The order already clears it. */
          qualifies: z.string(),
          /** The zone says the deployment does not deliver there. Advisory
           * like the rest of it: the order is not blocked, the customer is
           * asked for an address that works and told what happens if they
           * send it anyway. */
          noDelivery: z.string(),
          /** The address falls in no configured zone, which is normal: a
           * deployment need not describe everywhere it ships. */
          unknown: z.string(),
        })
        .strict(),
      /**
       * When the customer would like it (FR-CART-07). A wish, not a booking:
       * scheduling is settled between customer and manager, so this travels
       * as a note beside the order rather than as a window anything reserves.
       */
      timing: z
        .object({
          /** What an empty field says. A native date input takes no
           * `placeholder` and draws something else per engine, so the field
           * draws this. */
          placeholder: z.string(),
          /** Which days are on offer, in words: a native picker can grey out
           * what falls before the floor but not every weekend after it. */
          deliveryHint: z.string(),
          pickupHint: z.string(),
          /** Shown in the hint's place when the field holds a day the shop
           * does not offer. */
          unavailable: z.string(),
        })
        .strict(),
      /** How it is paid (FR-CART-04): recorded, never charged, and the
       * wording says so. No card: it comes only after approval (FR-CART-06). */
      payment: z
        .object({
          heading: z.string(),
          /** Cash is paid at the hand-over, which is a different moment
           * depending on who is doing the travelling. */
          cashDeliveryDescription: z.string(),
          cashPickupDescription: z.string(),
          transferDescription: z.string(),
          /** Why the option is there but cannot be taken: a bank transfer
           * invoices a legal entity, so it needs a company party. Said at
           * the row rather than refused after the form is filled. */
          transferCompanyOnly: z.string(),
          /** The same rule read the other way: cash is not taken from a
           * company, which is invoiced. */
          cashPersonOnly: z.string(),
        })
        .strict(),
      /** Anything the customer wants to say in words, copied onto the order
       * for the manager who reads it. Not the per-line note (FR-CART-08),
       * which belongs to a product. */
      note: z
        .object({
          label: z.string(),
          /** In the field rather than under it: what to write is the whole
           * of what there is to say about an empty box. */
          placeholder: z.string(),
        })
        .strict(),
      /** The read-back before sending, the second screen: each heading a
       * question the form asked, in its order. */
      review: z
        .object({
          title: z.string(),
          /** Says nothing has gone anywhere yet: the whole point of the
           * screen is that this is the last reversible moment. */
          intro: z.string(),
          /** Back to the form. Not "edit": there is one form and this is a
           * look at it, not a separate document. */
          back: z.string(),
          backToCart: z.string(),
          /** The form's own button, which leads here rather than sending. */
          send: z.string(),
        })
        .strict(),
      submit: z.string(),
      successHeading: z.string(),
      /** `{reference}`: the number to quote when asking about the order. */
      success: z.string(),
      /** Opens the order just sent: the account's page for a customer, the
       * mailed link's for a guest. */
      successView: z.string(),
      successAction: z.string(),
      /** What a refusal means, in the customer's words: the API sends codes,
       * and an unmapped one is a blank screen. */
      errors: z
        .object({
          /** The form itself is not finished; the fields say which. Says
           * "on the form" rather than "above": the button lives in a column
           * beside the questions once there is room for two. */
          incomplete: z.string(),
          invalidCompanyId: z.string(),
          unsupportedCountry: z.string(),
          /** The postcode is not the shape its country's codes take. */
          invalidPostalCode: z.string(),
          unknownPickupLocation: z.string(),
          billingDetailsRequired: z.string(),
          /** Cash was sent for an order invoiced to a company. */
          cashNotAvailable: z.string(),
          /** The party is a kind of customer the shop does not sell to
           * (FR-AUTH-13). */
          customerTypeNotAccepted: z.string(),
          partyRequired: z.string(),
          rejected: z.string(),
          /** Staff do not buy. Shown before the button is ever pressed as
           * well as after, so the one sentence covers both. */
          staffAccount: z.string(),
          /** The cart was re-priced under them; the corrected figures are
           * already on screen by the time this is read. */
          cartChanged: z.string(),
          /** Pairings enforced and the cart short (FR-SET-04): only from a page
           * out of step, as the cart disables its button. */
          pairingUnsatisfied: z.string(),
          /** The day was on offer when chosen and is not now: a checkout left
           * open past midnight. The field marks it. */
          preferredDateUnavailable: z.string(),
          /** Anything else at all. */
          generic: z.string(),
        })
        .strict(),
      /** How the goods arrive. The row that leads the form, because it
       * decides most of what follows it. */
      fulfilment: z
        .object({
          heading: z.string(),
          pickupDescription: z.string(),
          /** Opens the zone list, which the conditions page also shows. */
          conditionsLink: z.string(),
          conditionsHeading: z.string(),
          /** Says the zones are advisory: a threshold is quoted, never
           * enforced, and no delivery is priced here. */
          conditionsNote: z.string(),
          /** Link out of the dialog to the full conditions page, shown only
           * where the deployment publishes one. */
          conditionsMore: z.string(),
          /** A zone's free-delivery minimum; `{amount}` is substituted. */
          freeFrom: z.string(),
          /** For a zone with no minimum, said so a missing line does not read
           * as an unstated threshold. */
          noFreeDelivery: z.string(),
          /** Shown for a zone the deployment does not deliver to, in place
           * of a threshold. */
          noDelivery: z.string(),
          /** The office list's heading, under the cards as pickup's answer to
           * the address, not a question in the card's margin. */
          pickupHeading: z.string(),
          /** Under the collection points when none was chosen: the radio group
           * has no control to carry the error. */
          pickupRequired: z.string(),
          /** Opens one office's map, the same embed the contact page uses. */
          mapLink: z.string(),
        })
        .strict(),
    })
    .strict(),
  /** Order requests wherever read: the list, one order, the mailed link's
   * summary, worded alike. A request (FR-ACC-01): never a promised sale,
   * and the status is the shop's stand, not shipping. */
  orders: z
    .object({
      heading: z.string(),
      /** The account-page card, which only links to the list. */
      intro: z.string(),
      action: z.string(),
      /** `{count}` orders awaiting payment, and `{count}` packed for
       * collection (FR-WORK-03): what waits on the holder, apart. */
      awaitingPayment: z.string(),
      awaitingPickup: z.string(),
      /** How the history says it is narrowed to one of those two, as a chip
       * that dismisses back to the whole of it. */
      filterToPay: z.string(),
      filterToCollect: z.string(),
      /** The chip's dismiss control; `{label}` is the chip's own words. */
      filterRemoveAria: z.string(),
      /** The narrowed history is empty: the queue emptied after the marker
       * was drawn. */
      filterEmpty: z.string(),
      empty: z.string(),
      emptyAction: z.string(),
      /** `{count}` lines on an order, as the cart counts them. */
      itemCount: z.string(),
      error: z.string(),
      back: z.string(),
      /**
       * One order, read back. Only what the order page adds: its
       * blocks are headed by the same words the checkout asked the
       * questions in, so an order reads the same before and after
       * it was sent.
       */
      detail: z
        .object({
          /** `{date}` the request was sent. */
          placed: z.string(),
          /** Somebody else's reference or none: the API tells nobody which. */
          notFound: z.string(),
          backToList: z.string(),
          /** What the customer can open (FR-ORD-05): the summary, and the
           * payment details where supplied, each named for its purpose. */
          documents: z
            .object({
              heading: z.string(),
              summary: z.string(),
              paymentInstructions: z.string(),
            })
            .strict(),
          /**
           * Calling off your own order (FR-ORD-02), offered only while the
           * shop has not started on it. `{reference}` in the message.
           */
          cancel: z
            .object({
              action: z.string(),
              /** Why: the shop reads it, so it is asked for. */
              reasonLabel: z.string(),
              error: z.string(),
            })
            .strict(),
          /** Its dialog. `warning` only where a payment is recorded
           * (FR-ORD-04): the platform never moves money, and this is the
           * only place that says cancelling settles nothing. */
          cancelConfirm: confirmText,
          error: z.string(),
        })
        .strict(),
      /** The summary a mailed link opens (FR-NOTIF-06), without signing in:
       * a guest's only record. */
      public: z
        .object({
          heading: z.string(),
          intro: z.string(),
          /** A token that opens nothing: mistyped, or an order since gone. */
          notFound: z.string(),
          home: z.string(),
        })
        .strict(),
    })
    .strict(),
  /**
   * The conditions page's own words (FR-NAV-03). Only what checkout has no
   * sentence for: the zones, the pickup points and the payment rows reuse
   * checkout's text, so the page cannot word a condition differently.
   */
  conditions: z
    .object({
      /** Checkout asks a question here; a page needs a heading. */
      paymentHeading: z.string(),
      /** Checkout words cash for the hand-over in front of it; the page
       * covers both. */
      cashDescription: z.string(),
      /** The goods and what their prices cover: the shop's own paragraphs
       * first, each of which may set words in `<b>`, then the tax basis. */
      goodsHeading: z.string(),
      goodsParagraphs: z.array(z.string()),
      /** The tax basis in a sentence, one per basis; `{rate}` is the
       * deployment's default rate. */
      taxIncluded: z.string(),
      taxAdded: z.string(),
      taxNone: z.string(),
      /** How a return works, at the foot of the page; paragraphs as above.
       * The section is left out while it has nothing to say. */
      returnsHeading: z.string(),
      returnsParagraphs: z.array(z.string()),
      /** Link text to the withdrawal page, under the returns where the
       * deployment publishes that page. */
      returnsWithdrawalLink: z.string(),
    })
    .strict(),
};

export type StorefrontOrderingText = DeepReadonly<
  z.infer<z.ZodObject<typeof storefrontOrderingTextShape>>
>;
