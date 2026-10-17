import { DeepReadonly } from '@b2b-catalog-platform/shared/node';
import { refuseCountForms } from '@b2b-catalog-platform/shared';
import * as z from 'zod';
import { confirmText } from './text-shapes';

/** A suggestion list under a field: its name, what it says when nothing
 * matches, and `{count}` for the live region. */
const suggestText = z
  .object({
    suggestionsAria: z.string(),
    noSuggestions: z.string(),
    suggestionCountAria: z.string(),
  })
  .strict();

/**
 * Frontend-only UI text — the human-readable chrome wording (nav labels,
 * consent copy, error messages, footer wording). A single-locale catalog: each
 * deployment ships its one language's text here (i18n is out of scope). Kept
 * separate from DeploymentConfig so growing text has its own home and a
 * deployment can override the whole catalog as one unit.
 *
 * Injected into every document the Node process serves (see shell-state.ts),
 * so a per-deployment override is a runtime concern, not a rebuild. Non-secret
 * by construction: the browser renders it.
 *
 * This is the *public* half: everything a logged-out visitor can reach, which
 * includes the login form and the maintenance screen. Wording behind an admin
 * session lives in AdminText, which is fetched rather than injected — see
 * admin-text.type.ts.
 */
export const appTextSchema = z
  .object({
    /**
     * Footer chrome. `copyright` carries the whole line so a deployment owns
     * the symbol and word order; `{name}` and `{years}` are substituted at
     * render (years is either "2025–2026" or a single year).
     */
    footer: z
      .object({
        copyright: z.string(),
      })
      .strict(),
    /**
     * Text only assistive technology reads: landmark names and the accessible
     * names of controls whose visible content is an icon or a logo. It is still
     * user-facing copy in one language, so it belongs here rather than baked
     * into templates.
     */
    a11y: z
      .object({
        /** Accessible name of the logo's home link; `{name}` is substituted. */
        homeLink: z.string(),
        /** Landmark names for the navigations and the consent banner. */
        utilityNav: z.string(),
        primaryNav: z.string(),
        legalNav: z.string(),
        consentBanner: z.string(),
        /** Floating back-to-top control. */
        scrollToTop: z.string(),
      })
      .strict(),
    /** Storefront catalog chrome (FR-CAT). */
    catalog: z
      .object({
        /** Main navbar action label (icon button). */
        navLabel: z.string(),
        /** Accessible label for a category card link; `{name}` is substituted. */
        viewCategory: z.string(),
        emptyCategories: z.string(),
        loadError: z.string(),
        /** Category grid (FR-CAT-03/04). */
        catalogRoot: z.string(),
        showMore: z.string(),
        showLess: z.string(),
        emptyProducts: z.string(),
        prevPage: z.string(),
        nextPage: z.string(),
        /** `{page}` and `{total}` substituted at render. */
        pageStatus: z.string(),
        /** How many products the listing is showing, above the grid. Counts,
         * so it may carry both forms; `{count}` substituted at render. */
        productCount: z.string(),
        /**
         * The cards/lines toggle (FR-CAT-04). Two glyphs, so these are the
         * buttons' accessible names rather than visible labels.
         */
        /**
         * The marker of a product sold as a set of parts (FR-CAT-10). `short`
         * is the badge on a card or a line, `full` the product page's and the
         * short badge's tooltip, `{parts}` the parts joined by " + ".
         */
        set: z
          .object({
            short: z.string(),
            full: z.string(),
          })
          .strict(),
        /**
         * A product's variants (FR-CAT-11/12/13). `heading` names the list
         * beside the product page's gallery; `unavailable` is appended to a
         * variant marked currently unavailable; `note` stands under the list,
         * saying availability is confirmed after ordering; `mark` is the badge a row
         * opens the list with, and `markLabel` its accessible name, where
         * `{count}` is how many variants there are; `close` ends the list's
         * dialog on a phone.
         */
        variants: z
          .object({
            unavailable: z.string(),
            note: z.string(),
            markLabel: z.string(),
          })
          .strict(),
        layout: z
          .object({
            labelAria: z.string(),
            grid: z.string(),
            list: z.string(),
          })
          .strict(),
        /**
         * Sort control (FR-SEARCH-04). Keyed by the sort values the contract
         * defines, so the option list is a lookup rather than a mapping the UI
         * has to maintain. `relevance` is offered on search results only and
         * `category` on the whole catalogue only, but they live here with the
         * rest so a deployment has one place to word them.
         */
        sort: z
          .object({
            /** Caption beside the control. */
            label: z.string(),
            relevance: z.string(),
            category: z.string(),
            name: z.string(),
            name_desc: z.string(),
            price: z.string(),
            price_desc: z.string(),
            /**
             * The segments above a listing: what is sorted by, with the
             * direction drawn as an arrow beside it. The full wording above
             * stays each segment's accessible name.
             */
            fields: z
              .object({
                relevance: z.string(),
                category: z.string(),
                name: z.string(),
                price: z.string(),
              })
              .strict(),
          })
          .strict(),
        /**
         * The attribute filter panel and the applied-filter chips
         * (FR-ATTR-04…07). `selected` is the count shown on the narrow-screen
         * toggle, in brackets so it reads as a count beside the word rather
         * than as a second label.
         */
        filters: z
          .object({
            title: z.string(),
            /** `{count}` is the number of ticked values across all facets. */
            selected: z.string(),
            clearAll: z.string(),
            /** Accessible name of the chip row. */
            appliedAria: z.string(),
            /** A chip's remove button; `{label}` is "Attribute: value". */
            removeAria: z.string(),
            /** Shown where the grid would be, when a selection matches
             * nothing — beside the panel that can undo it, never instead of
             * it. */
            noMatches: z.string(),
          })
          .strict(),
        specifications: z.string(),
        /** Heads the four facts beside the photo, and the link under them
         * goes to the whole table. */
        mainSpecifications: z.string(),
        allSpecifications: z.string(),
        productNotFound: z.string(),
        categoryNotFound: z.string(),
        /** Back link on the catalogue's 404 screens. */
        backToCatalog: z.string(),
        /** Gallery thumbnail label; `{n}` is substituted. */
        viewImageAria: z.string(),
        /** Caption shown on the fallback tile when a product has no photo. */
        imagePlaceholder: z.string(),
        /**
         * Sold-together pairings (FR-SET-05). `label` names the thing
         * everywhere it appears — the marker's accessible name, the link on a
         * product page and in the cart, and the panel's own heading — so a
         * customer meets one word for it. `{count}` in `marker` is how many
         * counterparts there are.
         */
        pairings: z
          .object({
            marker: z.string(),
            /** Read under the heading, once the panel is open. */
            intro: z.string(),
            /** Where the counterparts could not be fetched. */
            loadError: z.string(),
          })
          .strict(),
        /**
         * The documents a product page lists (FR-DOC-03). `hintAria` is the
         * description every link carries, because each one leaves the page
         * for a file.
         */
        documents: z
          .object({
            hintAria: z.string(),
            /** The accessible name of a document's link beside its file
             * (FR-DOC-05); must contain `{host}`, which is what it shows. */
            linkAria: z.string(),
          })
          .strict(),
        /**
         * Units of sale (FR-UNIT-*). The unit words are **abbreviations** —
         * they follow a number and are never inflected, so a full word here
         * would read wrongly after some quantities ("4 pack × 1 pieces").
         */
        units: z
          .object({
            /** Price labels; `{unit}` is one of the abbreviations above. */
            perUnit: z.string(),
            /**
             * The summary itself. `{packs}`/`{pieces}`/`{total}` are counts and
             * `{packUnit}`/`{pieceUnit}` the abbreviations, so a deployment can
             * reorder them: "4 pk × 6 pcs = 24 pcs".
             */
            packagingFormula: z.string(),
            /** Used where a product has packs but no box. */
            packagingPerPack: z.string(),
            minQuantity: z.string(),
            boxCountSuffix: z.string(),
            /**
             * The unit selector's own labels. Separate from the words below on
             * purpose: these sit in a segment whose width they decide, and a
             * deployment may want them shorter than the words the cart uses in
             * a sentence.
             */
            select: z
              .object({
                piece: z.string(),
                pack: z.string(),
                box: z.string(),
              })
              .strict(),
          })
          .strict(),
      })
      .strict(),
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
        /** The header control's accessible name; `{count}` lines, `{total}`
         * money — one sentence, because a badge read on its own says nothing. */
        summaryAria: z.string(),
        empty: z.string(),
        emptyAction: z.string(),
        loadError: z.string(),
        /** The browser refused to store the cart — a full quota, or storage
         * turned off. Said out loud rather than losing the cart in silence. */
        storageFailed: z.string(),

        /** The buying block on the product page. */
        unitAria: z.string(),
        quantityAria: z.string(),
        /** Said in the bubble under a unit the product is not sold in — the
         * segment is shown rather than hidden, so it has to answer for itself. */
        unitNotSold: z.string(),
        /** The stepper buttons' accessible names — their content is an icon. */
        decreaseAria: z.string(),
        increaseAria: z.string(),
        noteLabel: z.string(),
        /** Fallback prompt where the product names none of its own. */
        notePrompt: z.string(),
        /** The note button beside the price on a card or a row, named for what
         * pressing it does — there is no room there for a labelled field. */
        noteAdd: z.string(),
        noteEdit: z.string(),
        add: z.string(),
        /** Replaces the add button once the product is in the cart, so the
         * controls above read as an edit of that line; `{total}` is what the
         * line costs. */
        addedFor: z.string(),
        /** Refused because the cart already holds as many lines as may be
         * priced in one call (`CART_LINES_MAX`). */
        full: z.string(),

        /** The cart page. */
        lineNoteAria: z.string(),
        /** `{name}` is the product. */
        removeAria: z.string(),
        /** Asked in the bubble under the stepper when `−` goes below the
         * smallest quantity the product is sold in, and the two answers. */
        removeQuestion: z.string(),
        removeYes: z.string(),
        removeNo: z.string(),
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
        subtotal: z.string(),
        /** Shown instead of a figure where a line cannot be priced. */
        noPrice: z.string(),
        /** The subtotal covers only the priceable lines. */
        totalIncomplete: z.string(),

        /** Leaves the cart for the checkout form, and goes back to the shelf
         * the visitor was standing at — the category, page and filters the URL
         * was carrying, or the catalogue where this visit has seen none. */
        checkout: z.string(),
        continueShopping: z.string(),
        /**
         * The shipment estimate (FR-UNIT-11), rendered as labelled rows — so
         * these are row captions, and the figures beside them come from the
         * estimate and the deployment's own box units.
         */
        /** The summary card beside the lines: what the order is, then what
         * the estimate makes of it. */
        summaryTitle: z.string(),
        /** How many lines the cart holds — the cart's own figure, stated
         * whether or not an estimate arrives. */
        summaryLines: z.string(),
        shipmentCartons: z.string(),
        shipmentVolume: z.string(),
        shipmentWeight: z.string(),
        shipmentApproximate: z.string(),
        /**
         * How many lines the estimate could not cover. Worded so `{count}`
         * lands at the end: there is no plural machinery here (one locale per
         * deployment, no i18n framework), so a sentence that reads "1 lines"
         * is a sentence to rewrite rather than a rule to add.
         */
        shipmentUncovered: z.string(),

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
            /** `{from}` and `{to}` are what the line cost and costs — the line
             * total, which is the figure the customer is about to pay. */
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

        /**
         * What preview says about a line. `unavailable` covers withdrawn,
         * unpublished and never-existed alike — the endpoint does not
         * distinguish them, and neither may the wording.
         */
        issues: z
          .object({
            unavailable: z.string(),
            /** Said where the product is no longer packed the way the line was
             * being read: the pieces are untouched and the quantity has fallen
             * back to them, so this reports a move rather than a refusal. */
            unitUnavailable: z.string(),
            /** Said wherever a quantity was rounded to one the shop can
             * supply — by a keystroke here, or by the server on a cart that
             * sat. Names no figures: the field beside it already shows the one
             * that stands. */
            quantityCorrected: z.string(),
            noteNotAllowed: z.string(),
            priceUnavailable: z.string(),
            /** The product is listed and priced but cannot be ordered
             * (FR-STOCK-04) — the badge says the state, and this says what it
             * means for the order. */
            outOfStock: z.string(),
          })
          .strict(),
        /**
         * What a cart is missing of what its products are sold with
         * (FR-SET-02/03/04). The shortfall is per line and is said in two
         * halves, because only the first of them is the link that opens the
         * counterparts: `shortAction` is the words to press — `{count}` pieces
         * and `{unit}` the piece abbreviation — and `shortReason` is the rest
         * of the sentence, in plain text. Where the split falls is a matter of
         * grammar, which is why it is text rather than code.
         *
         * The two summaries sit in the order card above the checkout button:
         * `summary` where an unsatisfied pairing is advisory,
         * `summaryEnforced` where the deployment refuses on it and the button
         * is disabled.
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
    /**
     * Checkout: the one form the cart leads into, and the preview it sends
     * from (FR-CART-03/04/07/09). What a *choice* means is worded here; what a
     * deployment offers — its zones, its offices — comes from deployment
     * config, so the two are never two copies of the same fact.
     */
    checkout: z
      .object({
        title: z.string(),
        /** One line under the heading, saying what this is: a request a
         * manager confirms, not a purchase being completed. */
        intro: z.string(),
        /** Sent here with nothing to order — the cart emptied in another tab,
         * or the URL was typed. */
        emptyCart: z.string(),
        /**
         * Offered to a visitor with no session, next to the figures it is
         * about: prices are tiered, so a customer who checks out as a guest is
         * quoted the lowest tier's. An offer, never a gate — registration needs
         * a manager's approval and could not finish this order anyway.
         */
        signInPrompt: z.string(),
        signInAction: z.string(),
        /** A signed-in account with no telephone number cannot place an order:
         * the contact block the manager answers from requires one. Said here
         * rather than left to a refusal, which arrives after the review. */
        phoneMissing: z.string(),
        phoneMissingAction: z.string(),
        /**
         * Everything a guest is asked about themselves (FR-CART-03/09) — who
         * is invoiced and how to reach them, which for a private person is one
         * answer. A signed-in customer sees none of it: the account answers
         * the contact, and the party row offers it as a choice.
         */
        contact: z
          .object({
            heading: z.string(),
            /** A private person: the party and the contact are the one name. */
            name: z.string(),
            /** A company: the party is the company, and this is whoever at it
             * we ring about the order. */
            contactName: z.string(),
            nameRequired: z.string(),
            /** What the details are for — a guest is handing a phone number to
             * a shop they have no account with. */
            note: z.string(),
          })
          .strict(),
        /**
         * Who the order is invoiced to (FR-CART-09) — the account's own party
         * or somebody else. The *address* row asks where the paperwork goes;
         * this asks whose name is on it.
         */
        party: z
          .object({
            heading: z.string(),
            /** The account's own party, where its name is not known yet — a
             * natural person is named, not labelled. */
            own: z.string(),
            /** Anybody but the account. One option rather than two, with the
             * kind of party asked inside it — the same switch registration
             * puts at the top of its own form. */
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
            /** Pickup asks for one address anyway — it belongs to the party
             * being invoiced, not to whoever carries the goods. */
            billingOnlyHeading: z.string(),
            /** The checked default: unchecking reveals a second picker. */
            sameAsDelivery: z.string(),
            /** The last option of a picker that has rows to offer. With none
             * there is no list and no option — the fields stand alone. */
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
            /** `{zone}` — the configured zone's own title. */
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
            /** What an empty field says. A native date input cannot take a
             * `placeholder`, and what it draws instead is a different thing in
             * every engine — "dd.mm.yyyy" on a desktop, an empty box on iOS —
             * so the field draws this itself. */
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
        /**
         * How it is paid (FR-CART-04). Recorded, never executed — nothing here
         * charges anybody, and the wording must not suggest otherwise. Card is
         * not offered: it is reachable only after a manager approves the
         * request (FR-CART-06).
         */
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
        /**
         * The read-back before it is sent (ADR 0039) — the second of the two
         * screens. Every heading is one of the questions the form asked, in
         * the order it asked them.
         */
        review: z
          .object({
            title: z.string(),
            /** Says nothing has gone anywhere yet: the whole point of the
             * screen is that this is the last reversible moment. */
            intro: z.string(),
            /** Where the invoice goes to the delivery address, said instead of
             * printing the same four lines twice. */
            billingSame: z.string(),
            /** No date asked for, which is an answer rather than a blank. */
            whenAny: z.string(),
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
        /** `{reference}` — the number to quote when asking about the order. */
        success: z.string(),
        /** Opens the order that was just sent — the account's own page for a
         * customer, the mailed link's page for a guest. */
        successView: z.string(),
        successAction: z.string(),
        /**
         * What a refusal means, in the customer's words. The API answers with
         * a code and never with a sentence, so every one of them is named
         * here — an unmapped code would be a blank screen.
         */
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
            partyRequired: z.string(),
            rejected: z.string(),
            /** Staff do not buy. Shown before the button is ever pressed as
             * well as after, so the one sentence covers both. */
            staffAccount: z.string(),
            /** The cart was re-priced under them; the corrected figures are
             * already on screen by the time this is read. */
            cartChanged: z.string(),
            /** The deployment enforces pairings and the cart is short
             * (FR-SET-04) — only reachable from a page out of step with the
             * cart, which disables its own button on the same figures. */
            pairingUnsatisfied: z.string(),
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
            /** Shown for a zone that quotes no minimum — said out loud, so an
             * absent line does not read as an unstated free threshold. */
            noFreeDelivery: z.string(),
            /** Shown for a zone the deployment does not deliver to, in place
             * of a threshold. */
            noDelivery: z.string(),
            /** Heading of the office list, which stands under the cards as
             * the pickup answer to the delivery address — not inside the card,
             * where it would be a second question asked in the margin. */
            pickupHeading: z.string(),
            /** Shown under the collection points when the form is submitted
             * without one chosen — the radio group has no control of its own to
             * carry the error. */
            pickupRequired: z.string(),
            /** Opens one office's map, the same embed the contact page uses. */
            mapLink: z.string(),
          })
          .strict(),
      })
      .strict(),
    /**
     * Order requests, wherever they are read — the account's own list, one
     * order in full, and the summary a mailed link opens. One section: the
     * three views describe the same thing and must not word it differently.
     *
     * An order is a request (FR-ACC-01): the wording never promises a
     * confirmed sale, and the status is where the shop stands with it rather
     * than a shipping state.
     */
    orders: z
      .object({
        heading: z.string(),
        /** The account-page card, which only links to the list. */
        intro: z.string(),
        action: z.string(),
        /** `{count}` of the account's own orders waiting to be paid for, and
         * `{count}` packed and waiting to be collected (FR-WORK-03) — the two
         * things that wait on the account holder, counted and linked apart. */
        awaitingPayment: z.string(),
        awaitingPickup: z.string(),
        /** How the history says it is narrowed to one of those two, as a chip
         * that dismisses back to the whole of it. */
        filterToPay: z.string(),
        filterToCollect: z.string(),
        /** The chip's dismiss control; `{label}` is the chip's own words. */
        filterRemoveAria: z.string(),
        /** Where the narrowed history has nothing in it — the queue emptied
         * between the marker being drawn and the link being followed. */
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
            /** Somebody else's reference, or one that never existed —
             * the API tells the two apart for nobody. */
            notFound: z.string(),
            backToList: z.string(),
            /**
             * What the customer can open on the order (FR-ORD-05): the
             * summary the shop draws, and the payment details where it has
             * supplied them. Not a heading per kind of file — a document is
             * named by what it is for, not by its format.
             */
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
                /** Why — the shop reads it, so it is asked for rather than
                 * optional. */
                reasonLabel: z.string(),
                error: z.string(),
              })
              .strict(),
            /**
             * Its dialog. The `warning` is said only where a payment has
             * already been recorded against the order (FR-ORD-04). The
             * platform records money arriving and never moves it, so
             * cancelling here settles nothing — and this sentence is the only
             * place anybody is told that.
             */
            cancelConfirm: confirmText,
            error: z.string(),
          })
          .strict(),
        /**
         * The summary a mailed link opens (FR-NOTIF-06), readable without
         * signing in — for a guest, who has no account to read the order from,
         * the only record of what they sent.
         */
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
    /** Product search: the navbar bar and its results page (FR-SEARCH). */
    search: z
      .object({
        /** Placeholder in the navbar field, and its accessible name. */
        placeholder: z.string(),
        /** Accessible name of the submit control and the mobile toggle. */
        submit: z.string(),
        openSearch: z.string(),
        closeSearchAria: z.string(),
        clearAria: z.string(),
        /** Landmark name for the search form. */
        searchNavAria: z.string(),
        /** Accessible name of the suggestion list (FR-SEARCH-05). */
        suggestionsAria: z.string(),
        /**
         * Announced to screen readers when suggestions appear; `{count}` is
         * substituted. Never shown on screen — the list itself is the visual
         * form of this message.
         */
        suggestionCountAria: z.string(),
        /**
         * Shown in the suggestion panel when a typed query matched no product
         * name. Deliberately terse: it is a status inside a dropdown, not the
         * results page's fuller "nothing matched" explanation.
         */
        noSuggestions: z.string(),
        /** Accessible name of the row of category chips (FR-SEARCH-07). */
        categoriesLabel: z.string(),
        /** The panel's way to the results page — the same place submitting
         * the query goes. */
        showAllResults: z.string(),
        /** Accessible name of a suggestion's icon-only add button
         * (FR-SEARCH-06); `{name}` is the product's. */
        addSuggestionAria: z.string(),
        /** Accessible name of the mark that replaces it once the product is
         * in the cart; `{name}` is the product's. */
        suggestionInCartAria: z.string(),
        /** Results heading; `{query}` is substituted. */
        resultsTitle: z.string(),
        /** Result count; `{count}` is substituted. Shown for one or more hits. */
        resultCount: z.string(),
        /** Shown when a query matched nothing; `{query}` is substituted. */
        noResults: z.string(),
        /** Advice under the no-results line — spelling, fewer words. */
        noResultsHint: z.string(),
        /** Shown when the page is opened with no query at all. */
        emptyQuery: z.string(),
        loadError: z.string(),
      })
      .strict(),
    /**
     * Login form, the navbar account link and the signed-in block on its
     * destination page. One vocabulary for all roles — the only thing that
     * differs per role is where the link goes (`adminPanel` vs `account`).
     */
    auth: z
      .object({
        login: z.string(),
        logout: z.string(),
        /** Static navbar label — deliberately role-independent, see accountNav usage. */
        accountNav: z.string(),
        /**
         * What the marker on the account control announces (FR-WORK-01).
         * `{count}` is substituted — the dot itself never shows a figure, so
         * this is the only place the total is spelled out.
         */
        workMarkerAria: z.string(),
        /** `{name}` — the account holder's first name, or their address when
         * the account carries no name (staff, the bootstrap admin). */
        greeting: z.string(),
        /** Heading of the change-password section, on /account and /admin
         * alike — the session's own password, not an account-page topic. */
        securityHeading: z.string(),
        adminPanel: z.string(),
        /** The same landing for a manager, whose panel holds only the accounts
         * they approve — no catalog, pricing or site controls. */
        staffArea: z.string(),
        account: z.string(),
        /** The password field, wherever an account's password is asked for. */
        password: z.string(),
        /** Offered to a guest after an order — on the confirmation and on the
         * page a mailed link opens — where waiting for approval costs them
         * nothing. */
        registerInvite: z
          .object({ text: z.string(), action: z.string() })
          .strict(),
        submit: z.string(),
        submitting: z.string(),
        invalid: z.string(),
        /** A customer's right password while maintenance mode is on — the
         * shop is open to staff only. */
        closed: z.string(),
        error: z.string(),
        /**
         * Asking for a reset link (FR-AUTH-02). The success copy has to be
         * written for someone who may have typed an address with no account:
         * it can promise nothing more than "if there is an account, a mail is
         * on its way", because the server deliberately does not say which.
         */
        forgotPassword: z
          .object({
            /** The way in, from the login form. */
            link: z.string(),
            heading: z.string(),
            intro: z.string(),
            submit: z.string(),
            successHeading: z.string(),
            success: z.string(),
            error: z.string(),
            backToLogin: z.string(),
          })
          .strict(),
        /**
         * Self-registration (FR-AUTH-01). An account is a request, not a
         * signup: the copy has to set that expectation before the visitor
         * submits, and the success state has to explain the wait.
         */
        register: z
          .object({
            /** The login page's call to action, and the line above it. */
            noAccount: z.string(),
            signUp: z.string(),
            heading: z.string(),
            intro: z.string(),
            /** The person/company choice staff use to read the request. */
            customerType: z.string(),
            companyIdHint: z.string(),
            submit: z.string(),
            /** Shown in place of the form once the request is in. */
            successHeading: z.string(),
            success: z.string(),
            error: z.string(),
            /** Link back to the login page from the register page. */
            haveAccount: z.string(),
          })
          .strict(),
        /**
         * Redeeming a set-a-password link (FR-AUTH-01/02) — the page an
         * invitation or a reset mail lands on.
         */
        setPassword: z
          .object({
            /** Heading while the link is being checked. */
            checking: z.string(),
            /** First password, i.e. an invitation. */
            setHeading: z.string(),
            setIntro: z.string(),
            /** Replacing an existing one, i.e. a reset. */
            resetHeading: z.string(),
            resetIntro: z.string(),
            /** Which account this link belongs to. */
            forAccount: z.string(),
            confirmPassword: z.string(),
            /** Reveal toggle on the password field. */
            show: z.string(),
            hide: z.string(),
            /** Offers a strong password to anyone who does not want to invent one. */
            generate: z.string(),
            generated: z.string(),
            submit: z.string(),
            successHeading: z.string(),
            success: z.string(),
            /** The link was expired, already used, or never valid. */
            expiredHeading: z.string(),
            expired: z.string(),
            /** A customer's good link while maintenance mode is on. It is
             * left unspent, to be used once the shop opens. */
            closedHeading: z.string(),
            closed: z.string(),
            error: z.string(),
          })
          .strict(),
        /**
         * The code after the password (FR-AUTH-12), on the sign-in form and
         * after choosing a password from a link. `{sentTo}` is where the code
         * went, masked: the phone, or the email address where a deployment
         * delivers codes by mail. `{phone}` is the number being confirmed,
         * `{length}` the code's digits, `{time}` a wait as minutes:seconds and
         * `{count}` the tries left.
         */
        signInStep: z
          .object({
            codeHeading: z.string(),
            codeIntro: z.string(),
            /** Under the intro while the number is being confirmed. */
            confirmNote: z.string(),
            code: z.string(),
            codeRequired: z.string(),
            codeFormat: z.string(),
            submit: z.string(),
            resend: z.string(),
            /** The resend control while the wait runs. */
            resendIn: z.string(),
            resent: z.string(),
            wrong: z.string(),
            /** Past its time, or entered wrongly too often. */
            expired: z.string(),
            /** The pending sign-in itself ran out. */
            restart: z.string(),
            restartAction: z.string(),
            limit: z.string(),
            /** The box that remembers this browser; `{days}` is filled in. */
            remember: z.string(),
            /** Under the box: it skips the code, not the password. */
            rememberHint: z.string(),
            /** No number on the account the step can use: staff correct it. */
            unreachableAccount: z.string(),
            unavailable: z.string(),
            error: z.string(),
            /**
             * The call screen, where the deployment proves the number by a
             * call from it. `{callTo}` is the number to call, `{phone}` the
             * account's (masked), `{time}` a wait.
             */
            callHeading: z.string(),
            callIntro: z.string(),
            /** Where mail stands in for the call; `{sentTo}` is the address. */
            callByMail: z.string(),
            /** Under the intro while the number is being confirmed. */
            callConfirmNote: z.string(),
            /** The link a phone can dial. */
            callDial: z.string(),
            /** While the check is open; `{time}` is what is left of it. */
            callWaiting: z.string(),
            callExpired: z.string(),
            callNew: z.string(),
            /** The new-number control while the wait runs. */
            callNewIn: z.string(),
            callRenewed: z.string(),
            callLimit: z.string(),
          })
          .strict(),
        /**
         * The change-password form, plus the modal that forces it on an account
         * still using a password it was handed rather than chose.
         */
        changePassword: z
          .object({
            heading: z.string(),
            /** What the account page says beside the link to the form. */
            intro: z.string(),
            currentPassword: z.string(),
            newPassword: z.string(),
            confirmPassword: z.string(),
            submit: z.string(),
            submitting: z.string(),
            success: z.string(),
            wrongCurrent: z.string(),
            error: z.string(),
            /** Modal-only copy: why the form is in the way. */
            forcedHeading: z.string(),
            forcedIntro: z.string(),
            /** Acknowledges the success message and dismisses the modal. */
            forcedContinue: z.string(),
          })
          .strict(),
        validation: z
          .object({
            passwordRequired: z.string(),
            currentPasswordRequired: z.string(),
            newPasswordRequired: z.string(),
            /** Carries the minimum length; `{min}` is substituted at render. */
            newPasswordTooShort: z.string(),
            confirmPasswordMismatch: z.string(),
          })
          .strict(),
        /**
         * What the server refused a password for, one line per rule the API
         * can answer with. Keyed by the API's own `code` so the lookup is the
         * code itself — nothing in the browser restates the server's wording,
         * and a deployment can phrase every refusal in its own voice.
         *
         * Both password forms read this: choosing a first password and
         * changing an existing one hit the same policy.
         */
        passwordRejected: z
          .object({
            'password-common': z.string(),
            'password-predictable': z.string(),
            'password-contains-email': z.string(),
            'password-contains-shop-name': z.string(),
            'password-unchanged': z.string(),
          })
          .strict(),
      })
      .strict(),
    /**
     * The account holder's own area. Sections rather than one flat list,
     * because this is where addresses and order history land next.
     */
    account: z
      .object({
        /** Names the details section — the heading over the card, since
         * the card no longer carries one of its own. */
        detailsHeading: z.string(),
        customerType: z.string(),
        memberSince: z.string(),
        /** Shown against the fields the account holder cannot edit here —
         * the ones staff approved the account on. */
        changeHint: z.string(),
        error: z.string(),
        /** Correcting your own name and phone number. */
        edit: z
          .object({
            action: z.string(),
            heading: z.string(),
            intro: z.string(),
            submit: z.string(),
            error: z.string(),
            /**
             * Under a number that receives sign-in codes (FR-AUTH-12):
             * shown, not offered, and who to ask to change it.
             */
            phoneLocked: z.string(),
          })
          .strict(),
        /**
         * The saved delivery/invoice addresses (FR-CART-04), and the page
         * that edits one. The fields themselves are `address`.
         */
        addresses: z
          .object({
            heading: z.string(),
            empty: z.string(),
            add: z.string(),
            /** The icon-only row buttons take their accessible name from
             * `{label}`, the address itself. */
            editAria: z.string(),
            removeAria: z.string(),
            /** `{label}` is the address's own name. */
            removeConfirm: confirmText,
            error: z.string(),
            newHeading: z.string(),
            editHeading: z.string(),
            intro: z.string(),
            submit: z.string(),
            saveError: z.string(),
            /** The book is full — a refusal the form has to explain. */
            limitReached: z.string(),
            unsupportedCountry: z.string(),
          })
          .strict(),
        /**
         * Deleting your own account (FR-AUTH-06). The copy carries the
         * honest reading of "delete": the row survives so past orders keep
         * their history, and registering again is a new account rather
         * than an undo.
         */
        delete: z
          .object({
            action: z.string(),
            heading: z.string(),
            intro: z.string(),
            /** What is kept and what goes, in the visitor's own terms. */
            consequences: z.array(z.string()),
            /**
             * Said only where the shop is still working on something for
             * this customer (FR-AUTH-06). `{count}` is how many.
             *
             * It refuses nothing. The order is one the shop agreed to
             * fill and is owed for, so it stays — but it stays without the
             * name, address and telephone number it was placed with, and
             * that is worth knowing before the button rather than after.
             */
            openOrders: z.string(),
            passwordHint: z.string(),
            submit: z.string(),
            cancel: z.string(),
            wrongPassword: z.string(),
            /** The last admin cannot leave; staff-only, but it must say so
             * rather than fail silently. */
            lastAdmin: z.string(),
            error: z.string(),
            /** Shown on the public site once the account is gone. */
            doneHeading: z.string(),
            done: z.string(),
          })
          .strict(),
      })
      .strict(),
    /** Storefront landing (FR-CAT-01): intro above the category showcase. */
    home: z
      .object({
        eyebrow: z.string(),
        title: z.string(),
        intro: z.string(),
        /** Over the category index, below the white band. */
        categoriesHeading: z.string(),
        /** The row of products above the categories (FR-CAT-09). Its heading
         * must not promise a selection: most of the row is often drawn at
         * random. */
        featured: z
          .object({
            heading: z.string(),
            /** The arrow buttons' accessible names; a mouse has no other way
             * to move a row that scrolls sideways. */
            previousAria: z.string(),
            nextAria: z.string(),
          })
          .strict(),
      })
      .strict(),
    /**
     * Under a legal page's text, when it last changed. `{date}` is
     * substituted, written out in the deployment's locale.
     */
    pageUpdated: z.object({ label: z.string() }).strict(),
    /**
     * The line on a form that takes personal details, pointing at the privacy
     * policy (NFR-LEGAL-01). Information, not agreement: it sits outside the
     * consent box. `link` follows `text` and becomes the link; a full stop
     * closes the sentence.
     */
    privacyNotice: z
      .object({
        text: z.string(),
        link: z.string(),
        /** Straight after the link, with no space: its closing punctuation,
         * empty where the language puts none there. */
        after: z.string(),
      })
      .strict(),
    /**
     * Beside checkout's submit button: sending the order accepts the terms of
     * sale (NFR-LEGAL-10). Shaped like `privacyNotice`.
     */
    termsNotice: z
      .object({ text: z.string(), link: z.string(), after: z.string() })
      .strict(),
    /**
     * Beside a consent box (NFR-LEGAL-09). The box's own wording is not here:
     * it is versioned with the consent text, which an admin edits.
     */
    consentBox: z
      .object({
        required: z.string(),
        /** The text changed while the form was open. */
        changed: z.string(),
        /** The deployment asks for a consent whose text was never written. */
        unavailable: z.string(),
      })
      .strict(),
    /** The company search under a registration number field, in every form
     * that asks for one — the storefront's and the admin's alike. */
    companySuggest: suggestText,
    /**
     * The address fields, in every form that asks for an address — the
     * address book's, checkout's and the admin's order adjustment alike. An
     * address is a place and carries no identity: who is invoiced is the
     * order's own question. The suggestion wording is here rather than under
     * a provider's name: a deployment with no adapter configured never shows
     * it, but the file loads whole either way.
     */
    address: z
      .object({
        /** The address's own name, for a book that keeps several. */
        label: z.string(),
        labelHint: z.string(),
        /** Opens the full address fields where the form asked for the street
         * alone. Always offered, never only after a provider fails. */
        enterManually: z.string(),
        /** The one field a suggesting form asks for before anything is
         * picked: it takes the whole address, and calling it the street
         * would be asking for a part of what it wants. */
        addressLine: z.string(),
        street: z.string(),
        street2: z.string(),
        postalCode: z.string(),
        city: z.string(),
        region: z.string(),
        country: z.string(),
        required: z.string(),
        /** `{example}` — a real code in the shape this country's take,
         * from the deployment's own postal rule. */
        postalCodeFormat: z.string(),
        /** The suggestion combobox (FR-CART-11). */
        suggest: suggestText,
      })
      .strict(),
    /** Who a registration or an order is for, as the choice offers it. */
    partyChoice: z.object({ person: z.string(), company: z.string() }).strict(),
    inquiry: z
      .object({
        intro: z.string(),
        preferredContact: z.string(),
        preferredEmail: z.string(),
        preferredPhone: z.string(),
        message: z.string(),
        submit: z.string(),
        success: z.string(),
        error: z.string(),
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
    /**
     * The tax basis prices are quoted on (NFR-LEGAL-11) — a statement, never a
     * figure: the shop's own invoice states the amount.
     */
    tax: z
      .object({
        /** Under a listing, which may hold goods at different rates and so
         * names none. Nothing is said where no tax is charged. */
        listing: z.object({ included: z.string(), added: z.string() }).strict(),
        /** Beside a price only, where a deployment says more there than the
         * statement, such as that delivery comes on top; `{statement}`. Not
         * under a total, which a pickup order has no delivery on. */
        atPrice: z.string().optional(),
      })
      .strict(),
    /**
     * The open-source attribution page. Its list is the build's own notice
     * file, so only the framing is text: `unavailable` covers a build that
     * extracted no licenses (development), `unknownLicense` a package that
     * declared no SPDX id.
     */
    licenses: z
      .object({
        intro: z.string(),
        unavailable: z.string(),
        unknownLicense: z.string(),
      })
      .strict(),
    map: z
      .object({
        /** In place of a map that waits for consent: who it comes from and
         * what loading it hands them. */
        consentNotice: z.string(),
        /** A button under the notice that loads the map, giving the same
         * consent the banner asks for. Without it the notice stands alone
         * and the banner is the only way in. */
        load: z.string().optional(),
      })
      .strict(),
    consent: z
      .object({
        message: z.string(),
        policyLink: z.string(),
        /** Straight after the link, as `privacyNotice.after`. */
        policyLinkAfter: z.string(),
        accept: z.string(),
        reject: z.string(),
        settings: z.string(),
      })
      .strict(),
    errors: z
      .object({
        notFoundTitle: z.string(),
        notFoundBody: z.string(),
        notFoundBack: z.string(),
        cannotLoadTitle: z.string(),
        cannotLoadBody: z.string(),
      })
      .strict(),
    /**
     * The public 503 screen shown while the storefront is gated (FR-ADM-04).
     * The control that toggles it is admin text.
     */
    maintenance: z
      .object({
        title: z.string(),
        body: z.string(),
      })
      .strict(),
  })
  .strict()
  .superRefine(refuseCountForms);

export type AppText = DeepReadonly<z.infer<typeof appTextSchema>>;
