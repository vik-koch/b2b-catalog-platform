import { DeepReadonly } from '@b2b-catalog-platform/shared/node';
import { z } from 'zod';

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
        remove: z.string(),
        restore: z.string(),
        reorder: z.string(),
        uploading: z.string(),
        uploadError: z.string(),
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
        pages: z.string(),
        pricing: z.string(),
        accounts: z.string(),
        site: z.string(),
        /** Deployed version line. `{version}` / `{date}` are substituted. */
        version: z.string(),
        versionUnknown: z.string(),
        deployedAt: z.string(),
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
        deleteCategory: z.string(),
        deletedHeading: z.string(),
        restoring: z.string(),
        restoreError: z.string(),
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
        attributes: z
          .object({
            heading: z.string(),
            key: z.string(),
            value: z.string(),
            add: z.string(),
            empty: z.string(),
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
            empty: z.string(),
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
        liveBadge: z.string(),
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
        stateAll: z.string(),
        stateLive: z.string(),
        stateDeleted: z.string(),
        allCategories: z.string(),
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
            custom: z.string(),
          })
          .strict(),
        /** Individual options, in the order the form shows them. */
        option: z
          .object({
            name: z.string(),
            category: z.string(),
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
        previewError: z.string(),
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
        applyError: z.string(),
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
        defaultLabel: z.string(),
        defaultHint: z.string(),
        edit: z.string(),
        /** The one-place-at-a-time move buttons on each row. */
        moveUp: z.string(),
        moveDown: z.string(),
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
     * The staff account list (FR-AUTH-03/04). Column headings double as the
     * sort/filter controls, so several of these are the accessible names of a
     * control whose visible text is the value in effect rather than a label.
     * The base price list's name is not here — it is the tier list's
     * `defaultLabel`, shared so the two screens name it identically.
     */
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
        type: z.string(),
        companyId: z.string(),
        registered: z.string(),
        /** Accessible names for the three column-heading filters. */
        filterRole: z.string(),
        filterTier: z.string(),
        filterStatus: z.string(),
        roleAll: z.string(),
        roleAdmin: z.string(),
        roleManager: z.string(),
        roleUser: z.string(),
        tierAll: z.string(),
        statusAll: z.string(),
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
        companyId: z.string(),
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
            companyIdRequired: z.string(),
            /** `{example}` is the deployment's own sample number. */
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
