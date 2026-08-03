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
            kept: z.string(),
            errors: z.string(),
          })
          .strict(),
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
