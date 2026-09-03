import { DeepReadonly } from '@b2b-catalog-platform/shared/node';
import * as z from 'zod';

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
     * Keyed by nav route segment — page slugs (PAGE_SLUGS) plus feature routes
     * like `contact`. Open by design (a record), so no `.strict()`.
     */
    nav: z.record(z.string(), z.string()),
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
        /** Main-page category overview (FR-CAT-01). */
        overviewTitle: z.string(),
        overviewIntro: z.string(),
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
        /**
         * The cards/lines toggle (FR-CAT-04). Two glyphs, so these are the
         * buttons' accessible names rather than visible labels.
         */
        layout: z
          .object({
            label: z.string(),
            grid: z.string(),
            list: z.string(),
          })
          .strict(),
        /**
         * Sort control (FR-SEARCH-04). Keyed by the sort values the contract
         * defines, so the option list is a lookup rather than a mapping the UI
         * has to maintain. `relevance` is offered on search results only, but
         * lives here with the rest so a deployment has one place to word them.
         */
        sort: z
          .object({
            /** Caption beside the control. */
            label: z.string(),
            relevance: z.string(),
            name: z.string(),
            name_desc: z.string(),
            price: z.string(),
            price_desc: z.string(),
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
            appliedLabel: z.string(),
            /** A chip's remove button; `{label}` is "Attribute: value". */
            remove: z.string(),
            /** Shown where the grid would be, when a selection matches
             * nothing — beside the panel that can undo it, never instead of
             * it. */
            noMatches: z.string(),
          })
          .strict(),
        /** Product detail (FR-CAT-05). The two headings the page's lower
         * half is split into, each of which is also its own anchor. */
        description: z.string(),
        specifications: z.string(),
        productNotFound: z.string(),
        categoryNotFound: z.string(),
        /** Back link on the catalogue's 404 screens. */
        backToCatalog: z.string(),
        /** Gallery thumbnail label; `{n}` is substituted. */
        viewImage: z.string(),
        /** Caption shown on the fallback tile when a product has no photo. */
        imagePlaceholder: z.string(),
        /**
         * Units of sale (FR-UNIT-*). The unit words are **abbreviations** —
         * they follow a number and are never inflected, so a full word here
         * would read wrongly after some quantities ("4 pack × 1 pieces").
         */
        units: z
          .object({
            piece: z.string(),
            pack: z.string(),
            box: z.string(),
            /** Price labels; `{unit}` is one of the abbreviations above. */
            perUnit: z.string(),
            /** Row label for the packaging summary in the spec table. */
            packaging: z.string(),
            /**
             * The summary itself. `{packs}`/`{pieces}`/`{total}` are counts and
             * `{packUnit}`/`{pieceUnit}` the abbreviations, so a deployment can
             * reorder them: "4 pk × 6 pcs = 24 pcs".
             */
            packagingFormula: z.string(),
            /** Used where a product has packs but no box. */
            packagingPerPack: z.string(),
            minQuantity: z.string(),
            /** `{qty}` is the minimum, `{unit}` the piece abbreviation. */
            minQuantityValue: z.string(),
            boxVolume: z.string(),
            boxWeight: z.string(),
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
            /**
             * The full unit words, for the cart — there a unit stands on its
             * own rather than after a number, and an abbreviation reads as a
             * typo ("Pk").
             */
            pieceName: z.string(),
            packName: z.string(),
            boxName: z.string(),
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
        summaryLabel: z.string(),
        empty: z.string(),
        emptyAction: z.string(),
        loadError: z.string(),
        /** The browser refused to store the cart — a full quota, or storage
         * turned off. Said out loud rather than losing the cart in silence. */
        storageFailed: z.string(),

        /** The buying block on the product page. */
        unitLabel: z.string(),
        quantityLabel: z.string(),
        /** Said in the bubble under a unit the product is not sold in — the
         * segment is shown rather than hidden, so it has to answer for itself. */
        unitNotSold: z.string(),
        /** The stepper buttons' accessible names — their content is an icon. */
        decrease: z.string(),
        increase: z.string(),
        noteLabel: z.string(),
        /** Fallback prompt where the product names none of its own. */
        notePrompt: z.string(),
        /** The note button beside the price on a card or a row, named for what
         * pressing it does — there is no room there for a labelled field. */
        noteAdd: z.string(),
        noteEdit: z.string(),
        /** Closes the note on a phone, where it is a modal rather than a
         * bubble and so has no "click away" to close it. */
        noteDone: z.string(),
        add: z.string(),
        /** Replaces the add button once the product is in the cart, so the
         * controls above read as an edit of that line; `{total}` is what the
         * line costs. */
        addedFor: z.string(),
        /** Refused because the cart already holds as many lines as may be
         * priced in one call (`CART_LINES_MAX`). */
        full: z.string(),

        /** The cart page. */
        lineNote: z.string(),
        /** `{name}` is the product. */
        remove: z.string(),
        /** Asked in the bubble under the stepper when `−` goes below the
         * smallest quantity the product is sold in, and the two answers. */
        removeQuestion: z.string(),
        removeYes: z.string(),
        removeNo: z.string(),
        /** A row's tick box, named by the product it selects: `{name}`. */
        selectLine: z.string(),
        /** The two controls above the lines. The first toggles: it offers the
         * whole cart until the whole cart is ticked, and giving the ticks back
         * after that. */
        selectAll: z.string(),
        clearSelection: z.string(),
        deleteSelected: z.string(),
        deleteSelectedHeading: z.string(),
        /** `{count}` lines. */
        deleteSelectedConfirm: z.string(),
        cancel: z.string(),
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
            dismiss: z.string(),
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
        /** The marker on the fields that are not required — the date and the
         * note, which the form asks for rather than needs. */
        optional: z.string(),
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
            person: z.string(),
            company: z.string(),
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
            deliveryLabel: z.string(),
            pickupLabel: z.string(),
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
            cashTitle: z.string(),
            /** Cash is paid at the hand-over, which is a different moment
             * depending on who is doing the travelling. */
            cashDeliveryDescription: z.string(),
            cashPickupDescription: z.string(),
            transferTitle: z.string(),
            transferDescription: z.string(),
            /** Why the option is there but cannot be taken: a bank transfer
             * invoices a legal entity, so it needs a company party. Said at
             * the row rather than refused after the form is filled. */
            transferCompanyOnly: z.string(),
            /** The same rule read the other way: cash is not taken from a
             * company, which is invoiced or pays by card. */
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
            items: z.string(),
            /** `{qty} {unit}` — a line's quantity as its own unit reads it. */
            quantity: z.string(),
            /** The same, for a line bought by the pack or the box: what that
             * comes to in pieces is what the shop picks and the customer
             * receives, and a review is where it is worth stating. */
            quantityPieces: z.string(),
            fulfilment: z.string(),
            invoice: z.string(),
            /** Where the invoice goes to the delivery address, said instead of
             * printing the same four lines twice. */
            billingSame: z.string(),
            /** No date asked for, which is an answer rather than a blank. */
            whenAny: z.string(),
            payment: z.string(),
            note: z.string(),
            /** Back to the form. Not "edit": there is one form and this is a
             * look at it, not a separate document. */
            back: z.string(),
            backToCart: z.string(),
            /** The form's own button, which leads here rather than sending. */
            send: z.string(),
          })
          .strict(),
        /** FR-CART-03: the privacy notice is accepted here as on every other
         * form that sends personal data. */
        privacyConsent: z.string(),
        privacyLink: z.string(),
        privacyRequired: z.string(),
        submit: z.string(),
        submitting: z.string(),
        successHeading: z.string(),
        /** `{reference}` — the number to quote when asking about the order. */
        success: z.string(),
        /** Opens the order that was just sent — the account's own page for a
         * customer, the mailed link's page for a guest. */
        successView: z.string(),
        successAction: z.string(),
        /** Shown to a guest on the confirmation, where waiting for approval
         * costs them nothing: the one place an account is worth offering. */
        successRegister: z.string(),
        successRegisterAction: z.string(),
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
            /** Anything else at all. */
            generic: z.string(),
          })
          .strict(),
        /** How the goods arrive. The row that leads the form, because it
         * decides most of what follows it. */
        fulfilment: z
          .object({
            heading: z.string(),
            /** Delivery gets no sentence: what it means is not in question,
             * and the conditions link under it is the answer to the only
             * thing that is. */
            deliveryTitle: z.string(),
            pickupTitle: z.string(),
            pickupDescription: z.string(),
            /** Opens the zone list. The binding long form stays on the
             * conditions page, which the dialog links to. */
            conditionsLink: z.string(),
            conditionsHeading: z.string(),
            /** Says the zones are advisory: a threshold is quoted, never
             * enforced, and no delivery is priced here. */
            conditionsNote: z.string(),
            /** Link out of the dialog to the full conditions page, shown only
             * where the deployment publishes one. */
            conditionsMore: z.string(),
            close: z.string(),
            /** A zone's free-delivery minimum; `{amount}` is substituted. */
            freeFrom: z.string(),
            /** Shown for a zone that quotes no minimum — said out loud, so an
             * absent line does not read as an unstated free threshold. */
            noFreeDelivery: z.string(),
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
        empty: z.string(),
        emptyAction: z.string(),
        /** `{count}` lines on an order, as the cart counts them. */
        itemCount: z.string(),
        /** Where an order stands. Only `requested` is written today;
         * the others arrive with order processing, and the list has to
         * be able to say them from the start. */
        statusRequested: z.string(),
        statusApproved: z.string(),
        statusDeclined: z.string(),
        statusCancelled: z.string(),
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
            contact: z.string(),
            /** Somebody else's reference, or one that never existed —
             * the API tells the two apart for nobody. */
            notFound: z.string(),
            backToList: z.string(),
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
            /** Offered here rather than at checkout: approval takes days, and
             * an order already sent costs nothing to wait for. */
            register: z.string(),
            registerAction: z.string(),
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
        closeSearch: z.string(),
        clear: z.string(),
        /** Landmark name for the search form. */
        searchNav: z.string(),
        /** Accessible name of the suggestion list (FR-SEARCH-05). */
        suggestionsLabel: z.string(),
        /**
         * Announced to screen readers when suggestions appear; `{count}` is
         * substituted. Never shown on screen — the list itself is the visual
         * form of this message.
         */
        suggestionCount: z.string(),
        /**
         * Shown in the suggestion panel when a typed query matched no product
         * name. Deliberately terse: it is a status inside a dropdown, not the
         * results page's fuller "nothing matched" explanation.
         */
        noSuggestions: z.string(),
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
        email: z.string(),
        password: z.string(),
        submit: z.string(),
        submitting: z.string(),
        invalid: z.string(),
        error: z.string(),
        /**
         * The account holder's own area. Sections rather than one flat list,
         * because this is where addresses and order history land next.
         */
        myAccount: z
          .object({
            /** The card that holds the details and the address book side by
             * side, which needs a name neither of them owns. */
            profileHeading: z.string(),
            detailsHeading: z.string(),
            name: z.string(),
            email: z.string(),
            phone: z.string(),
            customerType: z.string(),
            person: z.string(),
            company: z.string(),
            companyName: z.string(),
            companyId: z.string(),
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
                firstName: z.string(),
                lastName: z.string(),
                submit: z.string(),
                submitting: z.string(),
                cancel: z.string(),
                error: z.string(),
              })
              .strict(),
            /**
             * The saved delivery/invoice addresses (FR-CART-04), and the form
             * that edits one. An address is a place and carries no identity:
             * who is invoiced is the order's own question, worded at checkout.
             * The suggestion wording is here rather than under a provider's
             * name: a deployment with no adapter configured never shows it, but
             * the file loads whole either way.
             */
            addresses: z
              .object({
                heading: z.string(),
                empty: z.string(),
                add: z.string(),
                /** The icon-only row buttons take their accessible name from
                 * `{label}`, the address itself. */
                editLabel: z.string(),
                /** The wording on the confirm dialog's own button. */
                remove: z.string(),
                removeLabel: z.string(),
                /** `{label}` is the address's own name. */
                removeConfirm: z.string(),
                removeHeading: z.string(),
                error: z.string(),
                newHeading: z.string(),
                editHeading: z.string(),
                intro: z.string(),
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
                optional: z.string(),
                submit: z.string(),
                submitting: z.string(),
                cancel: z.string(),
                required: z.string(),
                /** `{example}` — a real code in the shape this country's take,
                 * from the deployment's own postal rule. */
                postalCodeFormat: z.string(),
                saveError: z.string(),
                /** The book is full — a refusal the form has to explain. */
                limitReached: z.string(),
                unsupportedCountry: z.string(),
                /** The suggestion combobox (FR-CART-11). */
                suggestionsLabel: z.string(),
                noSuggestions: z.string(),
                /** `{count}` suggestions, for the live region. */
                suggestionCount: z.string(),
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
                password: z.string(),
                passwordHint: z.string(),
                submit: z.string(),
                submitting: z.string(),
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
            submitting: z.string(),
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
            person: z.string(),
            company: z.string(),
            firstName: z.string(),
            lastName: z.string(),
            phone: z.string(),
            /** The invoiced party, required of a business alongside its id. */
            companyName: z.string(),
            /** Business registration number; its format is deployment config. */
            companyId: z.string(),
            companyIdHint: z.string(),
            companySuggest: z
              .object({
                suggestionsLabel: z.string(),
                noSuggestions: z.string(),
                /** `{count}` is substituted, for the live region. */
                suggestionCount: z.string(),
              })
              .strict(),
            privacyConsent: z.string(),
            privacyLink: z.string(),
            submit: z.string(),
            submitting: z.string(),
            /** Shown in place of the form once the request is in. */
            successHeading: z.string(),
            success: z.string(),
            error: z.string(),
            /** Link back to the login page from the register page. */
            haveAccount: z.string(),
            validation: z
              .object({
                firstNameRequired: z.string(),
                lastNameRequired: z.string(),
                phoneRequired: z.string(),
                phoneIncomplete: z.string(),
                companyNameRequired: z.string(),
                companyIdRequired: z.string(),
                /** Carries the deployment's own example; `{example}` is substituted. */
                companyIdFormat: z.string(),
                privacyRequired: z.string(),
              })
              .strict(),
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
            password: z.string(),
            confirmPassword: z.string(),
            /** Reveal toggle on the password field. */
            show: z.string(),
            hide: z.string(),
            /** Offers a strong password to anyone who does not want to invent one. */
            generate: z.string(),
            generated: z.string(),
            submit: z.string(),
            submitting: z.string(),
            successHeading: z.string(),
            success: z.string(),
            /** The link was expired, already used, or never valid. */
            expiredHeading: z.string(),
            expired: z.string(),
            error: z.string(),
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
            emailRequired: z.string(),
            emailInvalid: z.string(),
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
    /** Storefront landing (FR-CAT-01): intro above the category showcase. */
    home: z
      .object({
        eyebrow: z.string(),
        title: z.string(),
        intro: z.string(),
      })
      .strict(),
    inquiry: z
      .object({
        intro: z.string(),
        name: z.string(),
        email: z.string(),
        phone: z.string(),
        preferredContact: z.string(),
        preferredEmail: z.string(),
        preferredPhone: z.string(),
        message: z.string(),
        privacyConsent: z.string(),
        privacyLink: z.string(),
        submit: z.string(),
        submitting: z.string(),
        success: z.string(),
        error: z.string(),
        validation: z
          .object({
            nameRequired: z.string(),
            emailRequired: z.string(),
            emailInvalid: z.string(),
            phoneRequired: z.string(),
            phoneIncomplete: z.string(),
            privacyRequired: z.string(),
          })
          .strict(),
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
        consentNotice: z.string(),
      })
      .strict(),
    consent: z
      .object({
        message: z.string(),
        policyLink: z.string(),
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
  .strict();

export type AppText = DeepReadonly<z.infer<typeof appTextSchema>>;
