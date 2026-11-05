import { DeepReadonly } from '@b2b-catalog-platform/shared/platform';
import * as z from 'zod';
import { confirmText, pageText } from './text-shapes';

/** The keys of `texts/admin.json` no area claims. */
export const adminTextShape = {
  /**
   * Controls that read the same on every admin screen. Only genuinely
   * identical strings live here; anything that reads better with its subject
   * named ("Discard your unsaved changes to this product?") stays with its
   * own screen. Cancel, Close and Remove are the common text's.
   */
  actions: z
    .object({
      save: z.string(),
      preview: z.string(),
      resumeEditing: z.string(),
      /** Open a record for editing. */
      edit: z.string(),
      delete: z.string(),
      restore: z.string(),
      reorder: z.string(),
    })
    .strict(),
  /** The discard-unsaved-changes dialog every editor shares; the message is
   * each editor's own. */
  discard: z
    .object({
      heading: z.string(),
      confirm: z.string(),
      cancel: z.string(),
    })
    .strict(),
  /** Every place that takes a picture or a file. */
  upload: z
    .object({
      progress: z.string(),
      error: z.string(),
      /** Under a file target's own wording; `{keys}` is the shortcut as
       * this keyboard writes it. */
      pasteHint: z.string(),
      /** Beside an image tile, too small to say it on: `{keys}` as above. */
      tileHint: z.string(),
    })
    .strict(),
  /**
   * The admin grids' own controls: the way back to an unfiltered grid, the
   * column widths an admin drags, and the filter and sort pickers a phone
   * gets in place of the column headings it has no room for.
   */
  grid: z
    .object({
      clearFilters: z.string(),
      resizeColumn: z.string(),
      /** Names the boundary being dragged: `{column}`. */
      resizeColumnOfAria: z.string(),
      resetWidths: z.string(),
      filters: z.string(),
      sort: z.string(),
      /** The ordering a grid has when nothing is chosen. */
      sortDefault: z.string(),
      /** One line of the phone's sort picker: `{column}`. */
      sortAscending: z.string(),
      sortDescending: z.string(),
    })
    .strict(),
  /** How many are in effect, beside the word naming them (grid filters,
   * picked attribute names): `{count}`. */
  countSuffix: z.string(),
  /** Who did something, once their account has been deleted. */
  actorGone: z.string(),
  /** In place of a screen whose data did not arrive. */
  loadError: z.string(),
  /** The checks on a person's or company's details as staff are told
   * about somebody else's; the labels are shared names. */
  fields: z
    .object({
      name: z.object({ required: z.string() }).strict(),
      firstName: z.object({ required: z.string() }).strict(),
      lastName: z.object({ required: z.string() }).strict(),
      email: z.object({ required: z.string(), invalid: z.string() }).strict(),
      phone: z
        .object({ required: z.string(), incomplete: z.string() })
        .strict(),
      companyName: z.object({ required: z.string() }).strict(),
      /** `format` carries `{examples}`. */
      companyId: z
        .object({ required: z.string(), format: z.string() })
        .strict(),
    })
    .strict(),
  /** The dialog that places a catalog picture in a white square before it
   * is stored. */
  imageFramer: z
    .object({
      heading: z.string(),
      hint: z.string(),
      /** The square's accessible name: it is moved with the arrow keys. */
      stageAria: z.string(),
      zoom: z.string(),
      centre: z.string(),
      fill: z.string(),
      asIs: z.string(),
      apply: z.string(),
    })
    .strict(),
  /**
   * Headings on the admin dashboard (FR-ADM-01/03/04). `manage` and `site`
   * label the two cards; the rest label the tiers inside the manage card,
   * ordered ingest → catalog → content.
   */
  panel: z
    .object({
      /** The panel's title for an admin. */
      adminPanel: z.string(),
      /** The same landing for a manager, whose panel holds only the accounts
       * they approve. */
      staffArea: z.string(),
      /** The heading over the staff member's own password, and the link to
       * change it. */
      securityHeading: z.string(),
      changePassword: z.string(),
      /** Section headings. Each names a topic, never the one row under it:
       * a heading that repeats its own row says nothing twice. */
      catalog: z.string(),
      registries: z.string(),
      pages: z.string(),
      accounts: z.string(),
      /** The orders card's heading, shown to managers too: their daily
       * work. */
      orders: z.string(),
      /** How the shop is running and what it lets in from outside: the two
       * runtime switches, and the credentials an automated client presents.
       * One section, because "maintenance mode" was a heading that could only
       * ever name one card. */
      operations: z.string(),
      /**
       * What is unusual about how the shop is running, beside the operations
       * row. Shown only while true: a chip that says "maintenance off" on
       * every visit is a chip nobody sees when it says anything else.
       */
      maintenanceOn: z.string(),
      fullyOwned: z.string(),
      catalogOwned: z.string(),
      customersOwned: z.string(),
      ordersOwned: z.string(),
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
      /** Orders handed over with the money not recorded; `{count}`
       * substituted. */
      workUnpaid: z.string(),
      workProducts: z.string(),
      workUnpricedProducts: z.string(),
      /** Documents inside the expiry warning window; `{count}`
       * substituted. */
      workDocuments: z.string(),
      /** Documents whose expiry has already passed; `{count}`
       * substituted. */
      workDocumentsExpired: z.string(),
      /** Sync runs staged for review; `{count}` substituted. */
      workSyncRuns: z.string(),
    })
    .strict(),
  /** The storefront edit-mode toggle and its inline controls (FR-ADM-01). */
  editMode: z
    .object({
      purgeConfirm: confirmText,
      unpublishConfirm: confirmText,
      enable: z.string(),
      disable: z.string(),
      editProduct: z.string(),
      /** The way from a storefront page into the admin product list,
       * narrowed to what the page shows. */
      showInList: z.string(),
      addProduct: z.string(),
      deleteProduct: z.string(),
      /** The last removal step (FR-ADM-21), confirmed because it is the one
       * that cannot be undone. `{name}`. */
      purgeProduct: z.string(),
      editCategory: z.string(),
      editCategories: z.string(),
      /** Into this category's filter panel (FR-ATTR-11), or on the index the
       * whole catalogue's (FR-ATTR-12). */
      editFilters: z.string(),
      editPage: z.string(),
      /** In place of a static page's body no admin has written yet. */
      emptyPage: z.string(),
      /** The product badges and the no-price refusal a storefront page shows
       * staff, worded apart from the admin's lists. */
      deletedBadge: z.string(),
      unpublishedBadge: z.string(),
      unpricedBadge: z.string(),
      unpricedMessage: z.string(),
      /** The overlay under a category grid: everything the storefront hides. */
      hiddenHeading: z.string(),
      hiddenHint: z.string(),
      unpricedHint: z.string(),
      /** The heading over that explanation, where a click asks for it. */
      unpricedTitle: z.string(),
      publishProduct: z.string(),
      unpublishProduct: z.string(),
      /** Added to that confirmation when this product is the last one on
       * sale that some live product is paired with; `{names}` lists them. */
      unpublishStranded: z.string(),
      revealError: z.string(),
    })
    .strict(),
  /** The rich-text editor's controls, wherever it is used. */
  richText: z
    .object({
      toolbar: z
        .object({
          labelAria: z.string(),
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
          headingAria: z.string(),
          urlLabel: z.string(),
          placeholder: z.string(),
          /** Names the four forms an address may take. */
          hint: z.string(),
          apply: z.string(),
        })
        .strict(),
      imagePanel: z
        .object({
          headingAria: z.string(),
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
        })
        .strict(),
    })
    .strict(),
  /**
   * The screen the two runtime switches share (FR-ADM-04, FR-ADM-10), and
   * the trail of changes to both. They are one page because the trail covers
   * both: a settings history split across two screens is one an operator has
   * to read twice.
   */
  operations: z
    .object({
      page: pageText,
      backToPanel: z.string(),
      maintenanceHeading: z.string(),
      ownershipHeading: z.string(),
      loadError: z.string(),
      historyTitle: z.string(),
      historyEmpty: z.string(),
      /** `{area}` */
      historyOwnershipOn: z.string(),
      historyOwnershipOff: z.string(),
      historyMaintenanceOn: z.string(),
      historyMaintenanceOff: z.string(),
      /** `{date}` and `{actor}` */
      historyBy: z.string(),
      /** `{count}`: shown only when the list came back full. */
      historyMore: z.string(),
    })
    .strict(),
};

export type AdminText = DeepReadonly<
  z.infer<z.ZodObject<typeof adminTextShape>>
>;
