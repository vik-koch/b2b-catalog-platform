import { DeepReadonly } from '@b2b-catalog-platform/shared/node';
import { z } from 'zod';

/**
 * Frontend-only UI text — the human-readable chrome wording (nav labels,
 * consent copy, error messages, taglines). A single-locale catalog: each
 * deployment ships its one language's text here (i18n is out of scope). Kept
 * separate from DeploymentConfig so growing text has its own home and a
 * deployment can override the whole catalog as one unit.
 *
 * Injected into every document the Node process serves (see shell-state.ts),
 * so a per-deployment override is a runtime concern, not a rebuild. Non-secret
 * by construction: the browser renders it.
 */
export const appTextSchema = z
  .object({
    brand: z
      .object({
        tagline: z.string(),
      })
      .strict(),
    /**
     * Keyed by nav route segment — page slugs (PAGE_SLUGS) plus feature routes
     * like `contact`. Open by design (a record), so no `.strict()`.
     */
    nav: z.record(z.string(), z.string()),
    contact: z
      .object({
        intro: z.string(),
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
        /** Product detail (FR-CAT-05). */
        specifications: z.string(),
        productNotFound: z.string(),
        /** Gallery thumbnail label; `{n}` is substituted. */
        viewImage: z.string(),
        /** Caption shown on the fallback tile when a product has no photo. */
        imagePlaceholder: z.string(),
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
        signedInAs: z.string(),
        adminPanel: z.string(),
        account: z.string(),
        email: z.string(),
        password: z.string(),
        submit: z.string(),
        submitting: z.string(),
        invalid: z.string(),
        error: z.string(),
        underConstruction: z.string(),
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
    /** Inline static-page editing, shown to admins only (FR-ADM-03). */
    pageEditor: z
      .object({
        edit: z.string(),
        pageTitle: z.string(),
        save: z.string(),
        saving: z.string(),
        cancel: z.string(),
        preview: z.string(),
        resumeEditing: z.string(),
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
            remove: z.string(),
            cancel: z.string(),
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
            uploading: z.string(),
            uploadError: z.string(),
          })
          .strict(),
      })
      .strict(),
    /** The admin product Add/Edit screen (FR-ADM-01), admins only. */
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
        save: z.string(),
        saving: z.string(),
        cancel: z.string(),
        preview: z.string(),
        resumeEditing: z.string(),
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
            remove: z.string(),
            reorder: z.string(),
            paste: z.string(),
            copy: z.string(),
            empty: z.string(),
          })
          .strict(),
        images: z
          .object({
            heading: z.string(),
            add: z.string(),
            remove: z.string(),
            reorder: z.string(),
            uploading: z.string(),
            uploadError: z.string(),
            empty: z.string(),
          })
          .strict(),
      })
      .strict(),
    /** The storefront edit-mode toggle and inline admin controls (FR-ADM-01). */
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
        deleteCategory: z.string(),
        deletedHeading: z.string(),
        restore: z.string(),
        restoring: z.string(),
        restoreError: z.string(),
      })
      .strict(),
    /** The admin product-list screen (FR-ADM-01): includes soft-deleted rows. */
    adminProducts: z
      .object({
        title: z.string(),
        restore: z.string(),
        deletedBadge: z.string(),
        empty: z.string(),
      })
      .strict(),
    /** The admin category management screen (FR-ADM-01): tree CRUD + ordering. */
    adminCategories: z
      .object({
        title: z.string(),
        editTitle: z.string(),
        add: z.string(),
        addChild: z.string(),
        parent: z.string(),
        noParent: z.string(),
        image: z.string(),
        removeImage: z.string(),
        uploading: z.string(),
        uploadError: z.string(),
        reorder: z.string(),
        edit: z.string(),
        delete: z.string(),
        deleting: z.string(),
        /** Delete-confirmation modal. `{name}`/`{count}` substituted at render. */
        deleteTitle: z.string(),
        deleteConfirm: z.string(),
        deleteReassignIntro: z.string(),
        reassignLabel: z.string(),
        reassignPlaceholder: z.string(),
        deleteBlockedChildren: z.string(),
        deleteError: z.string(),
        deleteBlocked: z.string(),
        discardConfirm: z.string(),
        saveError: z.string(),
        empty: z.string(),
        defaultName: z.string(),
      })
      .strict(),
    /**
     * The bulk catalog sync screen (FR-ADM-02): the run's intent, the diff
     * preview, the delete confirmation, and the run history.
     */
    adminSync: z
      .object({
        title: z.string(),
        description: z.string(),
        /** Presets over the individual options. */
        modeLabel: z.string(),
        modeFull: z.string(),
        modeFullHint: z.string(),
        modePrices: z.string(),
        modePricesHint: z.string(),
        modeCustom: z.string(),
        advanced: z.string(),
        /** Individual options, in the order the form shows them. */
        optionName: z.string(),
        optionCategory: z.string(),
        optionCreateMissing: z.string(),
        optionUpdateExisting: z.string(),
        optionRestoreReturning: z.string(),
        optionCreateCategories: z.string(),
        optionAuthoritative: z.string(),
        optionSoftDelete: z.string(),
        optionSoftDeleteHint: z.string(),
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
        countCreate: z.string(),
        countUpdate: z.string(),
        countSoftDelete: z.string(),
        countRestore: z.string(),
        countUnchanged: z.string(),
        countCategories: z.string(),
        countKept: z.string(),
        countErrors: z.string(),
        productsTitle: z.string(),
        categoriesTitle: z.string(),
        categoriesHint: z.string(),
        emptiedTitle: z.string(),
        emptiedHint: z.string(),
        keptTitle: z.string(),
        keptHint: z.string(),
        errorsTitle: z.string(),
        errorRow: z.string(),
        truncated: z.string(),
        nothingToApply: z.string(),
        /** Change kinds, used as row badges. */
        kindCreate: z.string(),
        kindUpdate: z.string(),
        kindSoftDelete: z.string(),
        kindRestore: z.string(),
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
        colDate: z.string(),
        colFile: z.string(),
        colActor: z.string(),
        colStatus: z.string(),
        colChanges: z.string(),
        statusPreviewed: z.string(),
        statusApplied: z.string(),
        statusFailed: z.string(),
        lastSync: z.string(),
        lastSyncNever: z.string(),
      })
      .strict(),
    /** Section headings for the admin panel dashboard (FR-ADM-01/03/04). */
    adminPanel: z
      .object({
        catalog: z.string(),
        content: z.string(),
        site: z.string(),
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
     * Maintenance mode (FR-ADM-04): the public screen shown while the
     * storefront is gated, and the admin-panel control that toggles it.
     */
    maintenance: z
      .object({
        /** Public 503 screen. */
        title: z.string(),
        body: z.string(),
        /** Admin-panel toggle. */
        adminHeading: z.string(),
        adminDescription: z.string(),
        statusOn: z.string(),
        statusOff: z.string(),
        enable: z.string(),
        disable: z.string(),
        error: z.string(),
      })
      .strict(),
  })
  .strict();

export type AppText = DeepReadonly<z.infer<typeof appTextSchema>>;
