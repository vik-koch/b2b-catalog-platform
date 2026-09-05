import { DeepReadonly } from '@b2b-catalog-platform/shared/node';
import * as z from 'zod';

/**
 * UI text for the admin surfaces only — the editors, the management screens and
 * the storefront edit-mode affordances. Same single-locale, complete-or-die
 * contract as AppText, in its own file for one reason: it is delivered only to
 * signed-in admins (see admin-text.ts)
 *
 * The audience is the split, not the feature: text a logged-out visitor can
 * reach — the login form, the public maintenance screen — belongs in AppText
 * even when it is adjacent to an admin feature.
 */
export const adminTextSchema = z
  .object({
    /**
     * Wording shared verbatim by several admin screens. Only genuinely
     * identical strings live here; anything that reads better with its subject
     * named ("Discard your unsaved changes to this product?") stays with its
     * own screen.
     */
    common: z
      .object({
        save: z.string(),
        saving: z.string(),
        cancel: z.string(),
        preview: z.string(),
        resumeEditing: z.string(),
        /** Heading and confirm label of the discard-changes modal. */
        discardTitle: z.string(),
        discard: z.string(),
        keepEditing: z.string(),
        /** Open a record for editing; finish editing it. */
        edit: z.string(),
        done: z.string(),
        remove: z.string(),
        restore: z.string(),
        reorder: z.string(),
        uploading: z.string(),
        uploadError: z.string(),
        /** The way back to an unfiltered grid, on every admin list. */
        clearFilters: z.string(),
        /*
         * The admin grids' own controls: the column widths an admin drags, and
         * the filter and sort pickers a phone gets in place of the column
         * headings it has no room for.
         */
        resizeColumn: z.string(),
        /** Names the boundary being dragged: `{column}`. */
        resizeColumnOf: z.string(),
        resetWidths: z.string(),
        filters: z.string(),
        /** How many of something are in effect, beside the word that names
         * them — filters on a grid, checked names in the attribute picker:
         * `{count}`. */
        countSuffix: z.string(),
        sortLabel: z.string(),
        /** The ordering a grid has when nothing is chosen. */
        sortDefault: z.string(),
        /** One line of the phone's sort picker: `{column}`. */
        sortAscending: z.string(),
        sortDescending: z.string(),
        /**
         * Every refusal a catalog write can answer with, keyed by the API's own
         * `code`. Shared rather than per-screen because it genuinely is: the
         * product editor and the category delete dialog can both be told a slug
         * is taken or a category is gone, and one copy is how the two stay
         * saying the same thing.
         */
        catalogErrors: z
          .object({
            'product-not-found': z.string(),
            'category-not-found': z.string(),
            'reassign-target-not-found': z.string(),
            'category-has-subcategories': z.string(),
            'category-has-products': z.string(),
            'category-reassign-to-self': z.string(),
            'category-cycle': z.string(),
            'slug-taken': z.string(),
            'source-id-taken': z.string(),
            'tier-not-found': z.string(),
            'paired-product-not-found': z.string(),
            'pairing-self': z.string(),
            'slug-or-source-id-taken': z.string(),
          })
          .strict(),
      })
      .strict(),
    /**
     * Headings on the admin dashboard (FR-ADM-01/03/04). `manage` and `site`
     * label the two cards; the rest label the tiers inside the manage card,
     * ordered ingest → catalog → content.
     */
    panel: z
      .object({
        manage: z.string(),
        sync: z.string(),
        catalog: z.string(),
        /** Heading of the group holding the registry and the inventory. */
        attributes: z.string(),
        pages: z.string(),
        pricing: z.string(),
        accounts: z.string(),
        /** Heading of the orders card — a manager's daily work, so it is shown
         * to managers as well as admins. */
        orders: z.string(),
        site: z.string(),
        /** Deployed version line. `{version}` / `{date}` are substituted. */
        version: z.string(),
        versionUnknown: z.string(),
        deployedAt: z.string(),
        /**
         * What is waiting, beside the section that resolves it (FR-WORK-03).
         * `{count}` is substituted; each is a link into that list narrowed to
         * exactly the rows counted, so the sentence names the work rather than
         * the screen.
         */
        workRegistrations: z.string(),
        workOrders: z.string(),
        workProducts: z.string(),
      })
      .strict(),
    /** The storefront edit-mode toggle and its inline controls (FR-ADM-01). */
    editMode: z
      .object({
        enable: z.string(),
        disable: z.string(),
        editProduct: z.string(),
        addProduct: z.string(),
        deleteProduct: z.string(),
        deleteConfirm: z.string(),
        editCategory: z.string(),
        editCategories: z.string(),
        addCategory: z.string(),
        /** The way into this category's filter panel (FR-ATTR-11). */
        editFilters: z.string(),
        /** The overlay under a category grid: everything the storefront hides. */
        hiddenHeading: z.string(),
        hiddenHint: z.string(),
        deletedBadge: z.string(),
        unpublishedBadge: z.string(),
        publishProduct: z.string(),
        unpublishProduct: z.string(),
        unpublishConfirm: z.string(),
        /** The confirm dialog's cancel, so a storefront component never has to
         * reach into `common` — admin text is fetched, and only edit-mode
         * wording is gated on it having loaded. */
        cancel: z.string(),
        revealError: z.string(),
      })
      .strict(),
    /** Inline static-page editing (FR-ADM-03). */
    pageEditor: z
      .object({
        /** The storefront pencil's label. */
        edit: z.string(),
        /** Editor headings: a page with no row yet vs one being changed. */
        newTitle: z.string(),
        editTitle: z.string(),
        /** Shown in place of a body an admin has not written yet. */
        emptyNotice: z.string(),
        pageTitle: z.string(),
        previewNotice: z.string(),
        discardConfirm: z.string(),
        titleRequired: z.string(),
        saveError: z.string(),
        toolbar: z
          .object({
            label: z.string(),
            bold: z.string(),
            italic: z.string(),
            underline: z.string(),
            strikethrough: z.string(),
            heading2: z.string(),
            heading3: z.string(),
            bulletList: z.string(),
            orderedList: z.string(),
            blockquote: z.string(),
            link: z.string(),
            unlink: z.string(),
            removeFormatting: z.string(),
            horizontalRule: z.string(),
            image: z.string(),
          })
          .strict(),
        linkPanel: z
          .object({
            heading: z.string(),
            urlLabel: z.string(),
            placeholder: z.string(),
            apply: z.string(),
          })
          .strict(),
        imagePanel: z
          .object({
            heading: z.string(),
            altLabel: z.string(),
            altPlaceholder: z.string(),
            altHint: z.string(),
            linkLabel: z.string(),
            linkPlaceholder: z.string(),
            alignLabel: z.string(),
            alignNone: z.string(),
            alignLeft: z.string(),
            alignCenter: z.string(),
            alignRight: z.string(),
            widthLabel: z.string(),
            remove: z.string(),
            done: z.string(),
          })
          .strict(),
      })
      .strict(),
    /** The product Add/Edit screen (FR-ADM-01). */
    productEditor: z
      .object({
        newTitle: z.string(),
        editTitle: z.string(),
        name: z.string(),
        price: z.string(),
        category: z.string(),
        categoryPlaceholder: z.string(),
        slug: z.string(),
        slugHint: z.string(),
        sourceId: z.string(),
        sourceIdHint: z.string(),
        description: z.string(),
        previewNotice: z.string(),
        discardConfirm: z.string(),
        nameRequired: z.string(),
        categoryRequired: z.string(),
        priceInvalid: z.string(),
        saveError: z.string(),
        /** Commits the edits and puts the product on the storefront at once
         * (FR-ADM-06); shown only while it is not published. */
        saveAndPublish: z.string(),
        /** Discards, and lands on the storefront page rather than back where
         * the editor was opened from. */
        cancelToPage: z.string(),
        publishError: z.string(),
        attributes: z
          .object({
            heading: z.string(),
            key: z.string(),
            value: z.string(),
            add: z.string(),
            /** The picker of names the catalog already uses (FR-ATTR-09). */
            addKeys: z.string(),
            addKeysHint: z.string(),
            addKeysEmpty: z.string(),
            /** `{count}` is the number of names checked. */
            addKeysApply: z.string(),
            inTable: z.string(),
            /** `{count}` products carry the name. */
            products: z.string(),
            /** The row badges: what the shop does with this attribute. */
            filterable: z.string(),
            notNumeric: z.string(),
            /** The link into the inventory, live and dead. */
            showUsage: z.string(),
            unknownKey: z.string(),
          })
          .strict(),
        /**
         * Per-tier prices (FR-AUTH-05). The section is only rendered when the
         * deployment has tiers, but the wording is required all the same —
         * config is complete-or-die, not conditionally complete.
         */
        tierPrices: z
          .object({
            heading: z.string(),
            hint: z.string(),
            /** Placeholder on an empty tier field: it charges the base price. */
            usesBase: z.string(),
            /** `{tier}` is substituted with the tier's name. */
            invalid: z.string(),
          })
          .strict(),
        images: z
          .object({
            heading: z.string(),
            add: z.string(),
          })
          .strict(),
        /**
         * The per-line note a collective item may ask for (FR-CART-08) — the
         * policy, not the customer's text.
         */
        lineNote: z
          .object({
            heading: z.string(),
            hint: z.string(),
            /** The on/off control's own label. */
            enable: z.string(),
            prompt: z.string(),
            /** Shown under the prompt field: blank uses the shop-wide wording. */
            promptHint: z.string(),
            promptPlaceholder: z.string(),
          })
          .strict(),
        /** The products this one is sold together with (FR-SET-01). */
        pairings: z
          .object({
            heading: z.string(),
            hint: z.string(),
            /** The search field's label. */
            add: z.string(),
            addPlaceholder: z.string(),
            /** `{name}` — the remove button's accessible name. */
            remove: z.string(),
            /** `{count}` — shown once no more can be added. */
            limit: z.string(),
            /** The two states a counterpart can be in and still be listed. */
            deleted: z.string(),
            unpublished: z.string(),
            suggestionsLabel: z.string(),
            noSuggestions: z.string(),
            /** `{count}`, for the live region. */
            suggestionCount: z.string(),
          })
          .strict(),
        /** Pieces on hand, and what a customer is told about them
         * (FR-STOCK-01/02). */
        stock: z
          .object({
            heading: z.string(),
            hint: z.string(),
            pieces: z.string(),
            threshold: z.string(),
            /** Introduces the badge a customer would see right now. */
            preview: z.string(),
            /** Shown in place of the badge while nothing is tracked. */
            untracked: z.string(),
          })
          .strict(),
        /** Units of sale, and how many pieces the price covers (FR-UNIT-*). */
        packaging: z
          .object({
            heading: z.string(),
            hint: z.string(),
            piecesPerPack: z.string(),
            packsPerBox: z.string(),
            minPieceQty: z.string(),
            /** Under the field: the minimum is a floor, not the increment. */
            minPieceQtyHint: z.string(),
            priceBasis: z.string(),
            /** Sits inside a piece-count field, after the number. */
            pieceSuffix: z.string(),
            packSuffix: z.string(),
            boxVolume: z.string(),
            boxWeight: z.string(),
            boxCount: z.string(),
            notSoldPerPack: z.string(),
            notSoldPerBox: z.string(),
            /** What the entered packaging costs, shown beside the row that
             * defines each unit. `{price}` is substituted. */
            pricePerPiece: z.string(),
            pricePerPack: z.string(),
            pricePerBox: z.string(),
            basisMustDivide: z.string(),
            minMustFitPacks: z.string(),
            invalid: z.string(),
          })
          .strict(),
      })
      .strict(),
    /** The product-list screen (FR-ADM-01): includes soft-deleted rows, and
     * carries the grid's filters, search box and sortable headings
     * (FR-ADM-05). */
    productList: z
      .object({
        title: z.string(),
        deletedBadge: z.string(),
        /** Marks a product that is not on the storefront yet (FR-ADM-06). */
        unpublishedBadge: z.string(),
        empty: z.string(),
        /** Shown instead of `empty` when filters are what emptied the list. */
        noResults: z.string(),
        updated: z.string(),
        sourceId: z.string(),
        searchLabel: z.string(),
        searchPlaceholder: z.string(),
        clearSearch: z.string(),
        /** Accessible names for the two column-heading filters, whose visible
         * text is the selected value rather than a label. */
        filterState: z.string(),
        filterCategory: z.string(),
        /** The attribute drill-down's chip, which has no column to sit in. */
        filterAttribute: z.string(),
        clearAttribute: z.string(),
        /** The tier list's drill-down, shown as a chip for the same reason the
         * attribute one is: no column of the grid says it. */
        filterTier: z.string(),
        clearTier: z.string(),
        stateAll: z.string(),
        /** The column's own noun, for the phone's sort picker — where "All
         * states" would read as an ordering rather than a column. */
        state: z.string(),
        stateLive: z.string(),
        stateUnpublished: z.string(),
        stateDeleted: z.string(),
        allCategories: z.string(),
        /**
         * The stock column (FR-ADM-05). The cell is the piece count in the
         * badge the storefront's three words colour, so the *states* are not
         * worded again here — they come from the public app text, and a grid
         * that called "few left" something else would be a second vocabulary
         * for one fact. These are the column and its filter.
         */
        stock: z.string(),
        stockAll: z.string(),
        filterStock: z.string(),
        /** Read out with the figure, so the badge's colour is never the only
         * thing carrying the state. `{count}` and `{state}`. */
        stockLabel: z.string(),
        /** The cell of a product whose stock nobody is counting — a word, not
         * an empty cell, so "untracked" and "none left" cannot be confused. */
        stockUntracked: z.string(),
      })
      .strict(),
    /** The category list screen (FR-ADM-01): the tree, its row actions and the
     * reassign-then-delete dialog. */
    categoryList: z
      .object({
        title: z.string(),
        add: z.string(),
        addChild: z.string(),
        seeProducts: z.string(),
        editProducts: z.string(),
        /** The row's way into the category's filter panel (FR-ATTR-11). */
        editFilters: z.string(),
        edit: z.string(),
        delete: z.string(),
        deleting: z.string(),
        empty: z.string(),
        /** Drag-and-drop: what a drop does, and that it commits immediately. */
        reorderHint: z.string(),
        undo: z.string(),
        reorderError: z.string(),
        /** Delete-confirmation modal. `{name}`/`{count}` substituted at render. */
        deleteTitle: z.string(),
        deleteConfirm: z.string(),
        deleteReassignIntro: z.string(),
        reassignLabel: z.string(),
        reassignPlaceholder: z.string(),
        deleteBlockedChildren: z.string(),
        deleteError: z.string(),
      })
      .strict(),
    /**
     * The category Add/Edit screen (FR-ADM-01) — its own block, mirroring
     * productEditor. It carries its own field labels rather than borrowing the
     * product editor's: they are different screens, and sharing them is how the
     * category slug hint ended up describing a product's web address.
     */
    categoryEditor: z
      .object({
        newTitle: z.string(),
        editTitle: z.string(),
        name: z.string(),
        shortName: z.string(),
        shortNameHint: z.string(),
        parent: z.string(),
        noParent: z.string(),
        slug: z.string(),
        slugHint: z.string(),
        sourceId: z.string(),
        sourceIdHint: z.string(),
        description: z.string(),
        image: z.string(),
        discardConfirm: z.string(),
        nameRequired: z.string(),
        saveError: z.string(),
      })
      .strict(),
    /**
     * Bulk catalog sync (FR-ADM-02): the run's intent, the diff preview, the
     * delete confirmation and the run history. The `mode`/`option`/`count`/
     * `kind`/`status`/`col` groups are indexed dynamically from the screen's
     * own `as const` keys, so a missing key is a compile error, not a blank.
     */
    sync: z
      .object({
        title: z.string(),
        description: z.string(),
        modeLabel: z.string(),
        advanced: z.string(),
        /** Presets over the individual options. */
        mode: z
          .object({
            full: z.string(),
            fullHint: z.string(),
            prices: z.string(),
            pricesHint: z.string(),
            stock: z.string(),
            stockHint: z.string(),
            custom: z.string(),
          })
          .strict(),
        /** Individual options, in the order the form shows them. */
        option: z
          .object({
            name: z.string(),
            category: z.string(),
            stock: z.string(),
            createMissing: z.string(),
            updateExisting: z.string(),
            restoreReturning: z.string(),
            createCategories: z.string(),
            authoritative: z.string(),
            softDelete: z.string(),
            softDeleteHint: z.string(),
          })
          .strict(),
        file: z.string(),
        fileHint: z.string(),
        dropHint: z.string(),
        browse: z.string(),
        changeFile: z.string(),
        preview: z.string(),
        previewing: z.string(),
        /** Shown alone when the server said nothing usable about why. */
        previewError: z.string(),
        /**
         * Why the whole file was refused, keyed by the API's own `code`. The
         * substitutions name things in the admin's own file — `{column}`,
         * `{columns}`, `{expected}`, `{rows}`, `{limit}`, `{row}` — and are supplied by
         * the response, so the sentence around them stays the deployment's.
         */
        formatErrors: z
          .object({
            'no-file': z.string(),
            'file-too-large': z.string(),
            'file-empty': z.string(),
            'no-header-row': z.string(),
            'malformed-quotes': z.string(),
            'duplicate-column': z.string(),
            'unknown-columns': z.string(),
            'missing-required-column': z.string(),
            'too-many-rows': z.string(),
            'options-invalid': z.string(),
          })
          .strict(),
        /** The diff. `{count}` substituted at render. */
        summaryTitle: z.string(),
        count: z
          .object({
            create: z.string(),
            update: z.string(),
            softDelete: z.string(),
            restore: z.string(),
            unchanged: z.string(),
            categories: z.string(),
            renamedCategories: z.string(),
            kept: z.string(),
            errors: z.string(),
          })
          .strict(),
        productsTitle: z.string(),
        categoriesTitle: z.string(),
        categoriesHint: z.string(),
        renamedCategoriesTitle: z.string(),
        renamedCategoriesHint: z.string(),
        emptiedTitle: z.string(),
        emptiedHint: z.string(),
        keptTitle: z.string(),
        keptHint: z.string(),
        errorsTitle: z.string(),
        errorRow: z.string(),
        /**
         * Why a single row was skipped, keyed by the API's own `code`. The
         * substitutions quote the admin's file back at them — `{category}`,
         * `{price}`, `{column}`, `{key}`, `{known}`, `{first}`, `{second}`,
         * `{name}` — and come from the response.
         */
        rowErrors: z
          .object({
            'missing-source-id': z.string(),
            'duplicate-source-id': z.string(),
            'category-id-without-name': z.string(),
            'category-name-without-id': z.string(),
            'price-not-an-integer': z.string(),
            'stock-not-an-integer': z.string(),
            'unknown-price-list': z.string(),
            'category-name-conflict': z.string(),
            'unknown-category': z.string(),
            'cannot-create-product': z.string(),
          })
          .strict(),
        truncated: z.string(),
        nothingToApply: z.string(),
        /** Change kinds, used as row badges. */
        kind: z
          .object({
            create: z.string(),
            update: z.string(),
            softDelete: z.string(),
            restore: z.string(),
          })
          .strict(),
        /** The delete gate: a typed confirmation before an authoritative run. */
        deleteWarning: z.string(),
        deleteConfirmLabel: z.string(),
        deleteConfirmWord: z.string(),
        apply: z.string(),
        applying: z.string(),
        /** Why a previewed run could not be applied, keyed by the API's code. */
        applyErrors: z
          .object({
            'run-not-found': z.string(),
            'run-already-applied': z.string(),
            'run-failed': z.string(),
            'run-rows-pruned': z.string(),
          })
          .strict(),
        applied: z.string(),
        discard: z.string(),
        /** Run history + the dashboard's last-sync line. */
        historyTitle: z.string(),
        historyEmpty: z.string(),
        col: z
          .object({
            date: z.string(),
            file: z.string(),
            actor: z.string(),
            status: z.string(),
            changes: z.string(),
          })
          .strict(),
        status: z
          .object({
            previewed: z.string(),
            applied: z.string(),
            failed: z.string(),
          })
          .strict(),
        lastSync: z.string(),
        lastSyncNever: z.string(),
      })
      .strict(),
    /**
     * Customer tiers, i.e. price lists (FR-AUTH-05). The base list is not a
     * stored tier, so its name and explanation are deployment wording rather
     * than data — `defaultLabel`/`defaultHint` are what the list's first,
     * uneditable row shows.
     */
    tierList: z
      .object({
        title: z.string(),
        intro: z.string(),
        reorderError: z.string(),
        add: z.string(),
        label: z.string(),
        labelPlaceholder: z.string(),
        key: z.string(),
        keyPlaceholder: z.string(),
        keyHint: z.string(),
        /** Reference counts per row. `{count}` substituted at render. */
        accounts: z.string(),
        prices: z.string(),
        /** The link on that count, into the product grid filtered to it. */
        seePrices: z.string(),
        /** The same control, dead: the tier prices nothing to show. */
        noPrices: z.string(),
        defaultLabel: z.string(),
        defaultHint: z.string(),
        edit: z.string(),
        delete: z.string(),
        empty: z.string(),
        saveError: z.string(),
        labelRequired: z.string(),
        keyInvalid: z.string(),
        /** Delete confirmation. `{name}`/`{key}`/`{reason}` substituted. */
        deleteTitle: z.string(),
        deleteConfirm: z.string(),
        deleteBlocked: z.string(),
        deleteError: z.string(),
        /**
         * What the server refused, keyed by its own `code`. Mostly races: the
         * list checks the same things from the counts it already has, so these
         * are what somebody else changed in between.
         */
        errors: z
          .object({
            'tier-not-found': z.string(),
            'tier-key-taken': z.string(),
            'tier-has-accounts': z.string(),
            'tier-has-prices': z.string(),
          })
          .strict(),
      })
      .strict(),
    /**
     * The filterable-attribute registry (FR-ATTR-01). A definition names an
     * attribute the products already carry, so most of this wording is about
     * the exact match between the two — including the two amber notes, which
     * are the only place a mistyped name shows up before the filter is missing.
     */
    attributeList: z
      .object({
        title: z.string(),
        intro: z.string(),
        reorderError: z.string(),
        add: z.string(),
        name: z.string(),
        namePlaceholder: z.string(),
        nameHint: z.string(),
        type: z.string(),
        /** The two attribute types, keyed by the contract's own values. */
        types: z.object({ text: z.string(), number: z.string() }).strict(),
        unit: z.string(),
        unitPlaceholder: z.string(),
        /** Slug, called what an admin sees it as: the key in a filter URL. */
        slug: z.string(),
        slugPlaceholder: z.string(),
        slugInvalid: z.string(),
        /** Usage per row. `{count}` substituted at render. */
        products: z.string(),
        values: z.string(),
        unparsed: z.string(),
        noMatch: z.string(),
        edit: z.string(),
        /** The row's way into the inventory, expanded on this name. */
        showUsage: z.string(),
        delete: z.string(),
        empty: z.string(),
        saveError: z.string(),
        nameRequired: z.string(),
        /** Delete confirmation. `{name}` substituted. */
        deleteTitle: z.string(),
        deleteConfirm: z.string(),
        deleteError: z.string(),
        /** What the server refused, keyed by its own `code`. */
        errors: z
          .object({
            'attribute-not-found': z.string(),
            'attribute-name-taken': z.string(),
            'attribute-slug-taken': z.string(),
          })
          .strict(),
      })
      .strict(),
    /**
     * One category's filter panel (FR-ATTR-11). Nearly all of this wording is
     * about where the panel comes from: a category shows its parent's list
     * until it is given one, and the difference between "inherited" and "set
     * here" is the only thing that makes the reset button legible.
     */
    categoryFilters: z
      .object({
        title: z.string(),
        /** `{category}` substituted — the panel being edited. */
        heading: z.string(),
        intro: z.string(),
        /** Where the list comes from, keyed by the contract's `source`.
         * `inherited` takes `{category}`. */
        sources: z
          .object({
            own: z.string(),
            inherited: z.string(),
            default: z.string(),
          })
          .strict(),
        /** Per-row state. `{count}` substituted on `products`. */
        products: z.string(),
        notPresent: z.string(),
        /** An attribute declared after this panel was saved, so it is absent
         * from it rather than deliberately left out. */
        isNew: z.string(),
        show: z.string(),
        reorder: z.string(),
        save: z.string(),
        saveError: z.string(),
        /** Dropping the overlay so the category inherits again. */
        reset: z.string(),
        resetTitle: z.string(),
        resetConfirm: z.string(),
        /** Shown after a reset, which stays on the screen — unlike a save. */
        resetDone: z.string(),
        empty: z.string(),
        /** Offered nowhere: the registry itself is empty. */
        noDefinitions: z.string(),
        errors: z
          .object({
            'category-not-found': z.string(),
            'attribute-not-found': z.string(),
          })
          .strict(),
      })
      .strict(),
    /**
     * The attribute inventory (FR-ATTR-09) — every key and value the products
     * carry. Its wording is about renaming, because that is the only thing
     * this screen changes, and a rename here rewrites the whole catalog.
     */
    attributeInventory: z
      .object({
        title: z.string(),
        intro: z.string(),
        toDefinitions: z.string(),
        /** The two states of the row's link to the registry: a key the shop
         * filters by leads to its definition, a freetext one is deadened. */
        toDefinition: z.string(),
        notFilterable: z.string(),
        /** Usage per row. `{count}` substituted at render. */
        products: z.string(),
        values: z.string(),
        /** Marks a value that drops out of a number attribute's filter. */
        notNumeric: z.string(),
        /** Stands in for a value that is empty, so the row is not a blank. */
        emptyValue: z.string(),
        showProducts: z.string(),
        renameKey: z.string(),
        renameValue: z.string(),
        newText: z.string(),
        /** Rename confirmation. `{from}`/`{to}` substituted. `mergeConfirm`
         * replaces it where the new text is already in use, since that is a
         * merge and not a correction. */
        renameTitle: z.string(),
        renameConfirm: z.string(),
        mergeConfirm: z.string(),
        renameError: z.string(),
        empty: z.string(),
      })
      .strict(),
    /**
     * The staff account list (FR-AUTH-03/04). Column headings double as the
     * sort/filter controls, so several of these are the accessible names of a
     * control whose visible text is the value in effect rather than a label.
     * The base price list's name is not here — it is the tier list's
     * `defaultLabel`, shared so the two screens name it identically.
     */
    /** The staff order list (FR-AUTH-03) — read-only: an order is a request a
     * manager answers by phone or mail. */
    orderList: z
      .object({
        title: z.string(),
        searchLabel: z.string(),
        searchPlaceholder: z.string(),
        clearSearch: z.string(),
        empty: z.string(),
        /** Shown instead of `empty` when the status filter emptied the list. */
        noResults: z.string(),
        loadError: z.string(),
        /** Column headings. */
        reference: z.string(),
        placed: z.string(),
        customer: z.string(),
        items: z.string(),
        total: z.string(),
        filterStatus: z.string(),
        statusAll: z.string(),
        /** The column's own noun, for the phone's sort picker — where "All
         * statuses" would read as an ordering rather than a column. */
        status: z.string(),
        statusRequested: z.string(),
        statusApproved: z.string(),
        statusDeclined: z.string(),
        statusCancelled: z.string(),
        /** A guest order: nobody signed in placed it. */
        guest: z.string(),
        /** `{count}` lines on the order. */
        itemCount: z.string(),
      })
      .strict(),
    /** One order in full, as staff read it. */
    orderDetail: z
      .object({
        /** `{date}` the request was sent, and `{date}` its status last moved. */
        placed: z.string(),
        statusChanged: z.string(),
        notFound: z.string(),
        loadError: z.string(),
        back: z.string(),
        items: z.string(),
        /** The account it was placed from, or that it was a guest's. */
        customer: z.string(),
        /** Which price list it was taken from; the default list has no name of
         * its own here. */
        tier: z.string(),
        tierDefault: z.string(),
        /** The blocks, headed as the checkout asked its questions. */
        fulfilment: z.string(),
        delivery: z.string(),
        pickup: z.string(),
        invoice: z.string(),
        billingSame: z.string(),
        deliveryDate: z.string(),
        pickupDate: z.string(),
        whenAny: z.string(),
        payment: z.string(),
        cash: z.string(),
        transfer: z.string(),
        contact: z.string(),
        note: z.string(),
        /** A line in basis units — `{count} × {price}`, the way the source
         * system prices. */
        basis: z.string(),
      })
      .strict(),
    userList: z
      .object({
        /** The two lists, each reached from its own button on the admin panel;
         * a manager only ever sees the customer one, so neither heading has to
         * name the distinction. */
        titleCustomers: z.string(),
        titleStaff: z.string(),
        searchLabel: z.string(),
        searchPlaceholder: z.string(),
        clearSearch: z.string(),
        empty: z.string(),
        /** Shown instead of `empty` when filters are what emptied the list. */
        noResults: z.string(),
        loadError: z.string(),
        /** Column headings. */
        name: z.string(),
        email: z.string(),
        phone: z.string(),
        companyId: z.string(),
        registered: z.string(),
        /** Accessible names for the column-heading filters. */
        filterRole: z.string(),
        filterTier: z.string(),
        /** Only rendered where the deployment configures several formats. */
        filterCompanyIdFormat: z.string(),
        filterStatus: z.string(),
        roleAll: z.string(),
        roleAdmin: z.string(),
        roleManager: z.string(),
        roleUser: z.string(),
        tierAll: z.string(),
        companyIdFormatAll: z.string(),
        /** The accounts carrying no registration number — private persons. */
        companyIdFormatNone: z.string(),
        statusAll: z.string(),
        /** The column's own noun, for the phone's sort picker — where "All
         * statuses" would read as an ordering rather than a column. */
        status: z.string(),
        statusPending: z.string(),
        statusInvited: z.string(),
        statusActive: z.string(),
        statusDisabled: z.string(),
        statusAnonymized: z.string(),
        typePerson: z.string(),
        typeCompany: z.string(),
        /** Row actions (FR-AUTH-03/04). `actions` names the column for a screen
         * reader; the rest are the icon buttons' accessible names. `{name}` in
         * `declineConfirm` is substituted at render. */
        actions: z.string(),
        approve: z.string(),
        edit: z.string(),
        decline: z.string(),
        declineTitle: z.string(),
        declineConfirm: z.string(),
        /** Switching an account off and on again. `{name}` is substituted. */
        deactivate: z.string(),
        deactivateTitle: z.string(),
        deactivateConfirm: z.string(),
        reactivate: z.string(),
        reactivateTitle: z.string(),
        reactivateConfirm: z.string(),
        saveError: z.string(),
        /** The two Add buttons — one per tab, since they create different
         * things and land on different forms. */
        addCustomer: z.string(),
        addStaff: z.string(),
        /**
         * Every refusal the account surface can answer with, keyed by the API's
         * own `code`. The editor reads these too, like the status and role
         * labels above: a refused approval says the same thing wherever the
         * click came from.
         */
        errors: z
          .object({
            'account-not-found': z.string(),
            'account-not-pending': z.string(),
            'account-closed': z.string(),
            'email-taken': z.string(),
            'account-not-approved': z.string(),
            'account-not-disabled': z.string(),
            'account-not-invited': z.string(),
            'self-deactivate': z.string(),
            'self-demote': z.string(),
            'last-admin': z.string(),
            'account-not-purgeable': z.string(),
            /** The two a manager is refused, shown next to the field. */
            'role-change-admin-only': z.string(),
            'staff-create-admin-only': z.string(),
          })
          .strict(),
      })
      .strict(),
    /**
     * The account editor (FR-AUTH-03/04) — add, edit and approve on one screen.
     * Status, role, tier and customer-type *labels* are read from `userList`
     * rather than repeated here: they name the same things, and two copies is
     * how they drift apart.
     */
    userEditor: z
      .object({
        newCustomerTitle: z.string(),
        newStaffTitle: z.string(),
        editTitle: z.string(),
        /** Heading while the account is still awaiting a decision. */
        approveTitle: z.string(),
        email: z.string(),
        /** Why the address is shown but not editable. */
        emailFixed: z.string(),
        firstName: z.string(),
        lastName: z.string(),
        phone: z.string(),
        companyName: z.string(),
        companyId: z.string(),
        companySuggest: z
          .object({
            suggestionsLabel: z.string(),
            noSuggestions: z.string(),
            /** `{count}` is substituted, for the live region. */
            suggestionCount: z.string(),
          })
          .strict(),
        customerType: z.string(),
        tier: z.string(),
        tierChoose: z.string(),
        role: z.string(),
        /** Said on the create form: nobody is ever sent a password (ADR 0034). */
        inviteHint: z.string(),
        /** Re-sending the set-your-password link, for a mail that never
         * arrived. Only ever shown while the account is still `invited`. */
        resend: z.string(),
        resendSent: z.string(),
        status: z.string(),
        create: z.string(),
        approve: z.string(),
        notFound: z.string(),
        /** An anonymized account is a record, not an editable one. */
        closed: z.string(),
        saveError: z.string(),
        discardConfirm: z.string(),
        validation: z
          .object({
            firstNameRequired: z.string(),
            lastNameRequired: z.string(),
            emailRequired: z.string(),
            emailInvalid: z.string(),
            phoneIncomplete: z.string(),
            companyNameRequired: z.string(),
            companyIdRequired: z.string(),
            /** `{examples}` is every sample number the deployment configures. */
            companyIdFormat: z.string(),
            tierRequired: z.string(),
          })
          .strict(),
      })
      .strict(),
    /** The admin-panel control that gates the storefront (FR-ADM-04). */
    maintenance: z
      .object({
        heading: z.string(),
        description: z.string(),
        statusOn: z.string(),
        statusOff: z.string(),
        enable: z.string(),
        disable: z.string(),
        error: z.string(),
      })
      .strict(),
  })
  .strict();

export type AdminText = DeepReadonly<z.infer<typeof adminTextSchema>>;
