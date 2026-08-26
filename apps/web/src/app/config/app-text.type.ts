import { DeepReadonly } from '@b2b-catalog-platform/shared/node';
import { z } from 'zod';

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
        /** Mobile one-tap call action; `{phone}` is substituted. */
        callPhone: z.string(),
        toggleMenu: z.string(),
        /** Landmark names for the three navigations and the consent banner. */
        utilityNav: z.string(),
        legalNav: z.string(),
        consentBanner: z.string(),
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
        /** Product detail (FR-CAT-05). */
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
        /** Shown after a piece quantity was rounded up: `{from}`, `{to}`,
         * `{unit}`. */
        quantityCorrected: z.string(),
        /** The stepper buttons' accessible names — their content is an icon. */
        decrease: z.string(),
        increase: z.string(),
        noteLabel: z.string(),
        /** Fallback prompt where the product names none of its own. */
        notePrompt: z.string(),
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
        /** Deliberately not a date: every order is a request a manager prices
         * and confirms, so the row says that rather than promising a day. */
        shipmentDelivery: z.string(),
        shipmentDeliveryValue: z.string(),
        shipmentApproximate: z.string(),
        /**
         * How many lines the estimate could not cover. Worded so `{count}`
         * lands at the end: there is no plural machinery here (one locale per
         * deployment, no i18n framework), so a sentence that reads "1 lines"
         * is a sentence to rewrite rather than a rule to add.
         */
        shipmentUncovered: z.string(),

        /**
         * What preview says about a line. `unavailable` covers withdrawn,
         * unpublished and never-existed alike — the endpoint does not
         * distinguish them, and neither may the wording.
         */
        issues: z
          .object({
            unavailable: z.string(),
            unitUnavailable: z.string(),
            quantityCorrected: z.string(),
            noteNotAllowed: z.string(),
            priceUnavailable: z.string(),
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
             * that edits one. The suggestion wording is here rather than under
             * a provider's name: a deployment with no adapter configured never
             * shows it, but the file loads whole either way.
             */
            addresses: z
              .object({
                heading: z.string(),
                empty: z.string(),
                add: z.string(),
                edit: z.string(),
                remove: z.string(),
                /** `{label}` is the address's own name. */
                removeConfirm: z.string(),
                removeHeading: z.string(),
                error: z.string(),
                newHeading: z.string(),
                editHeading: z.string(),
                intro: z.string(),
                label: z.string(),
                labelHint: z.string(),
                companyName: z.string(),
                companyId: z.string(),
                /** Says when the number matters at all — the book is untyped,
                 * so the field is on every address but needed only where one
                 * is invoiced. */
                companyIdHint: z.string(),
                companySuggest: z
                  .object({
                    suggestionsLabel: z.string(),
                    noSuggestions: z.string(),
                    /** `{count}` is substituted, for the live region. */
                    suggestionCount: z.string(),
                  })
                  .strict(),
                street: z.string(),
                street2: z.string(),
                postalCode: z.string(),
                city: z.string(),
                region: z.string(),
                country: z.string(),
                phone: z.string(),
                optional: z.string(),
                submit: z.string(),
                submitting: z.string(),
                cancel: z.string(),
                required: z.string(),
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
