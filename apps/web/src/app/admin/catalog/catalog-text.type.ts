import type { DeepReadonly } from '@b2b-catalog-platform/shared/platform';
import * as z from 'zod';
import { confirmText, pageText } from '../../platform/config/text-shapes';

/** The catalog's block of `texts/admin.json`. */
export const adminCatalogTextShape = {
  /** Every refusal a catalog write answers with, keyed by the API's `code`:
   * one copy, so two screens refusing the same thing say the same. */
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
      'document-not-found': z.string(),
      'pairing-self': z.string(),
      'slug-or-source-id-taken': z.string(),
      'product-has-no-price': z.string(),
      'product-published': z.string(),
      'product-deleted': z.string(),
      'product-not-deleted': z.string(),
      'product-ordered': z.string(),
    })
    .strict(),
  /** The product screens, and what every catalog screen calls a product's
   * state and how it counts them. */
  products: z
    .object({
      deleted: z.string(),
      unpublished: z.string(),
      unpriced: z.string(),
      /** `{count}` products. */
      count: z.string(),
      /** Beside a product count, how many of those are not on the
       * storefront: "{count} unpublished". Shown only above zero. */
      unpublishedCount: z.string(),
      /** The product-list screen (FR-ADM-01): includes soft-deleted rows, and
       * carries the grid's filters, search box and sortable headings
       * (FR-ADM-05). */
      list: z
        .object({
          page: pageText,
          empty: z.string(),
          /** Shown instead of `empty` when filters are what emptied the
           * list. */
          noResults: z.string(),
          /** The order a search lists its results in until a heading is
           * chosen. */
          bestMatch: z.string(),
          updated: z.string(),
          sourceId: z.string(),
          searchAria: z.string(),
          searchPlaceholder: z.string(),
          clearSearch: z.string(),
          /** Accessible names for the two column-heading filters, whose
           * visible text is the selected value rather than a label. */
          filterState: z.string(),
          filterCategory: z.string(),
          /** The attribute drill-down's chip, which has no column to sit
           * in. */
          filterAttribute: z.string(),
          clearAttributeAria: z.string(),
          /** The tier list's drill-down, shown as a chip for the same reason
           * the attribute one is: no column of the grid says it. */
          filterTier: z.string(),
          clearTierAria: z.string(),
          /** Which side of a price list to show: the products it prices, or
           * the gap. */
          tierPricedYes: z.string(),
          tierPricedNo: z.string(),
          noPrice: z.string(),
          /** The document list's drill-down, a chip for the same reason. */
          filterDocument: z.string(),
          clearDocumentAria: z.string(),
          stateAll: z.string(),
          /** The column's own noun, for the phone's sort picker — where "All
           * states" would read as an ordering rather than a column. */
          state: z.string(),
          stateLive: z.string(),
          /** Under the empty list when a search found nothing in the catalog
           * but matches deleted products (FR-ADM-22): `{count}`, then the
           * link that switches to them. */
          deletedMatches: z.string(),
          showDeleted: z.string(),
          allCategories: z.string(),
          /** The category filter's option for the products filed in a
           * category itself, not in its subcategories. `{name}` is the
           * category. */
          categoryDirect: z.string(),
          /** The stock column and its filter (FR-ADM-05). The states are the shared
           * product words, so one fact has one vocabulary. */
          stock: z.string(),
          stockAll: z.string(),
          filterStock: z.string(),
          /** Read out with the figure, so the badge's colour is never the
           * only thing carrying the state. `{count}` and `{state}`. */
          stockAria: z.string(),
          /** The cell of a product whose stock nobody is counting — a word,
           * not an empty cell, so "untracked" and "none left" cannot be
           * confused. */
          stockUntracked: z.string(),
          /** The content filter (FR-ADM-20) and the line naming what keeps a product
           * incomplete; `{gaps}` joins the `gap` words. */
          missingGroupAria: z.string(),
          hasGroupAria: z.string(),
          missing: z
            .object({
              incomplete: z.string(),
              price: z.string(),
              picture: z.string(),
              description: z.string(),
              attributes: z.string(),
              packaging: z.string(),
              boxFacts: z.string(),
            })
            .strict(),
          has: z
            .object({
              featured: z.string(),
              set: z.string(),
              variants: z.string(),
              pairings: z.string(),
              documents: z.string(),
              note: z.string(),
            })
            .strict(),
          gapsLabel: z.string(),
          gap: z
            .object({
              price: z.string(),
              picture: z.string(),
              description: z.string(),
              attributes: z.string(),
            })
            .strict(),
        })
        .strict(),
      /** The product Add/Edit screen (FR-ADM-01). */
      editor: z
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
          previewNotice: z.string(),
          discardConfirm: z.string(),
          nameRequired: z.string(),
          categoryRequired: z.string(),
          priceInvalid: z.string(),
          /** The price field's label, naming the list it writes: `{list}`. */
          priceWithList: z.string(),
          /** What clearing it costs, and the button that says so. */
          priceCleared: z.string(),
          saveAndUnpublish: z.string(),
          /** Stands in for a per-pack or per-box figure with no price behind it. */
          packagingUnavailable: z.string(),
          saveError: z.string(),
          /** Commits the edits and puts the product on the storefront at once
           * (FR-ADM-06); shown only while it is not published. */
          saveAndPublish: z.string(),
          /** Discards, and lands on the storefront page rather than back
           * where the editor was opened from. */
          cancelToPage: z.string(),
          publishError: z.string(),
          attributes: z
            .object({
              heading: z.string(),
              key: z.string(),
              value: z.string(),
              addAria: z.string(),
              /** The picker of names the catalog already uses
               * (FR-ATTR-09). */
              addKeys: z.string(),
              addKeysHint: z.string(),
              addKeysEmpty: z.string(),
              /** `{count}` is the number of names checked. */
              addKeysApply: z.string(),
              inTable: z.string(),
              /** The row badges: what the shop does with this attribute. */
              filterable: z.string(),
              notNumeric: z.string(),
              /** A set's row naming a part it does not have (FR-CAT-10);
               * `{part}` and `{key}`, the filter it misses. */
              strayPart: z.string(),
            })
            .strict(),
          /** Per-tier prices (FR-AUTH-05): required even without tiers, as the file
           * is complete or refused. */
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
              /** The picker under a picture: its accessible name, and the
               * choice for a picture of the whole range (FR-CAT-11). */
              variantAria: z.string(),
              noVariant: z.string(),
              /** Opens a stored picture in the framer again. */
              reframe: z.string(),
            })
            .strict(),
          /** The variants an assorted product's pictures show
           * (FR-CAT-11/12). */
          variants: z
            .object({
              hint: z.string(),
              /** A variant's name field, for a screen reader. */
              nameAria: z.string(),
              add: z.string(),
              addPlaceholder: z.string(),
              addButton: z.string(),
              /** A variant's remove button; `{name}` is the variant. */
              removeAria: z.string(),
              unavailable: z.string(),
              /** The pictures column's heading, where the row has columns. */
              picturesHeading: z.string(),
              /** How many pictures show a variant; `{count}`. */
              pictures: z.string(),
              /** Shown in place of the field once the list is full;
               * `{count}`. */
              limit: z.string(),
              /** Under a list with a blank or repeated name, and the save's
               * refusal of it. */
              duplicate: z.string(),
              /** Under the add field, refusing a name the list already
               * has. */
              exists: z.string(),
              /** Where every picture shows an unavailable variant. */
              allWithheld: z.string(),
            })
            .strict(),
          /**
           * The per-line note a collective item may ask for (FR-CART-08) —
           * the policy, not the customer's text.
           */
          /** The parts a product sold as a set is made of (FR-CAT-10). */
          parts: z
            .object({
              heading: z.string(),
              hint: z.string(),
              /** The add field's label, and its placeholder. */
              add: z.string(),
              addPlaceholder: z.string(),
              addButton: z.string(),
              /** A part's remove button; `{name}` is the part. */
              removeAria: z.string(),
              /** Shown in place of the field once the list is full;
               * `{count}`. */
              limit: z.string(),
              /** Under a list of one, and the save's refusal of it. */
              tooFew: z.string(),
              /** A refused add; `{max}` is the longest part allowed. */
              rejected: z.string(),
            })
            .strict(),
          /** The main page's row (FR-CAT-09). */
          /** What a shut feature box says where the feature is on, as the
           * list-shaped ones say how many. */
          switchedOn: z.string(),
          featured: z
            .object({
              heading: z.string(),
              hint: z.string(),
              enable: z.string(),
            })
            .strict(),
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
          /** The product's documents (FR-DOC-02), worded like the pairings editor:
           * the same kind of control. */
          documents: z
            .object({
              hint: z.string(),
              add: z.string(),
              addPlaceholder: z.string(),
              /** `{name}` substituted — the document being taken off. */
              removeAria: z.string(),
              /** Per row. `{date}` substituted; `noExpiry` where there is none. */
              expires: z.string(),
              noExpiry: z.string(),
              suggestionsAria: z.string(),
              noSuggestions: z.string(),
              /** Announced to a screen reader. `{count}` substituted. */
              suggestionCountAria: z.string(),
            })
            .strict(),
          /** The products this one is sold together with (FR-SET-01). */
          pairings: z
            .object({
              hint: z.string(),
              /** The search field's label. */
              add: z.string(),
              addPlaceholder: z.string(),
              /** `{name}` — the remove button's accessible name. */
              removeAria: z.string(),
              /** `{count}` — shown once no more can be added. */
              limit: z.string(),
              suggestionsAria: z.string(),
              noSuggestions: z.string(),
              /** `{count}`, for the live region. */
              suggestionCountAria: z.string(),
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
          /** The product's own tax rate (NFR-LEGAL-11); the placeholder shows the
           * default, `notInEffect` where no tax is charged. */
          taxRate: z
            .object({
              label: z.string(),
              notInEffect: z.string(),
              invalid: z.string(),
            })
            .strict(),
          /** Units of sale, and how many pieces the price covers
           * (FR-UNIT-*). */
          packaging: z
            .object({
              hint: z.string(),
              minPieceQty: z.string(),
              /** Under the field: the minimum is a floor, not the
               * increment. */
              minPieceQtyHint: z.string(),
              boxCount: z.string(),
              notSoldPerPack: z.string(),
              notSoldPerBox: z.string(),
              /** What the entered packaging costs, shown beside the row that
               * defines each unit. `{price}` is substituted. */
              pricePerPack: z.string(),
              pricePerBox: z.string(),
              minMustFitPacks: z.string(),
              invalid: z.string(),
            })
            .strict(),
        })
        .strict(),
    })
    .strict(),
  /** The category screens. */
  categories: z
    .object({
      /** The category list screen (FR-ADM-01): the tree, its row actions and
       * the reassign-then-delete dialog. */
      list: z
        .object({
          page: pageText,
          add: z.string(),
          addChild: z.string(),
          seeProducts: z.string(),
          editProducts: z.string(),
          noProducts: z.string(),
          /** The products filed in a category that also has subcategories,
           * leaving theirs out. `{count}` substituted. */
          directProducts: z.string(),
          /** Beside a category with no live product beneath it, which the
           * storefront leaves out of its navigation (FR-ADM-19). */
          notShown: z.string(),
          /** The row's way into the category's filter panel (FR-ATTR-11). */
          editFilters: z.string(),
          /** The page's way into the whole catalogue's panel (FR-ATTR-12). */
          catalogFilters: z.string(),
          empty: z.string(),
          /** Drag-and-drop: what a drop does, and that it commits
           * immediately. */
          reorderHint: z.string(),
          undo: z.string(),
          reorderError: z.string(),
          /** Delete-confirmation modal. `{name}`/`{count}` substituted at render. */
          deleteTitle: z.string(),
          deleteConfirm: z.string(),
          deleteReassignIntro: z.string(),
          /** After the intro when some of them are deleted products, which
           * move too (FR-ADM-22). `{count}` substituted. */
          deleteReassignDeleted: z.string(),
          reassignLabel: z.string(),
          reassignPlaceholder: z.string(),
          deleteBlockedChildren: z.string(),
          deleteError: z.string(),
        })
        .strict(),
      /** The category editor (FR-ADM-01), with field labels of its own: a shared
       * slug hint once described a product's address. */
      editor: z
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
          mark: z.string(),
          markHint: z.string(),
          discardConfirm: z.string(),
          nameRequired: z.string(),
          saveError: z.string(),
        })
        .strict(),
      /** One category's filter panel (FR-ATTR-11): inherited from its parent until
       * set here, which is what makes the reset legible. */
      filters: z
        .object({
          resetConfirm: confirmText,
          page: pageText,
          /** `{category}` substituted — the panel being edited. */
          heading: z.string(),
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
          /** An attribute declared after this panel was saved, so it is
           * absent from it rather than deliberately left out. */
          isNew: z.string(),
          show: z.string(),
          reorder: z.string(),
          save: z.string(),
          saveError: z.string(),
          /** Dropping the overlay so the category inherits again. */
          reset: z.string(),
          /** Shown after a reset, which stays on the screen — unlike a
           * save. */
          resetDone: z.string(),
          empty: z.string(),
          /** Offered nowhere: the registry itself is empty. */
          noDefinitions: z.string(),
          /** The whole-catalogue panel (FR-ATTR-12): nothing inherits it and
           * it inherits nothing, so it has its own heading, intro and empty
           * state in place of `heading`, `intro`, `sources` and `empty`. */
          catalogHeading: z.string(),
          catalogIntro: z.string(),
          catalogEmpty: z.string(),
          errors: z
            .object({
              'category-not-found': z.string(),
              'attribute-not-found': z.string(),
            })
            .strict(),
        })
        .strict(),
    })
    .strict(),
  /** Price lists (FR-AUTH-05). Names are data; the wording is the default's
   * badge and what moving it costs. */
  tiers: z
    .object({
      /** What an account with no tier of its own is charged, naming the
       * storefront's list: `{list}`. A null tier is not a blank — it is the
       * default list, and the screens say which one that is. */
      defaultName: z.string(),
      deleteConfirm: confirmText,
      setDefaultConfirm: confirmText,
      page: pageText,
      reorderError: z.string(),
      add: z.string(),
      label: z.string(),
      labelPlaceholder: z.string(),
      key: z.string(),
      keyPlaceholder: z.string(),
      keyHint: z.string(),
      /** Reference counts per row. `{count}` substituted at render. */
      accounts: z.string(),
      /** The links those counts carry: into the customer list on this tier,
       * and into the product grid priced by it. */
      seeAccounts: z.string(),
      seePrices: z.string(),
      /** Where the gap between two lists leads: the products this one does
       * not price. */
      seeUnpriced: z.string(),
      unpriced: z.string(),
      /** The badge on the list the storefront quotes, and what it means. */
      defaultBadge: z.string(),
      defaultHint: z.string(),
      /** Moving that badge. `{name}`/`{count}` substituted at render. */
      setDefault: z.string(),
      setDefaultWarning: z.string(),
      setDefaultNone: z.string(),
      setDefaultDone: z.string(),
      setDefaultError: z.string(),
      empty: z.string(),
      saveError: z.string(),
      labelRequired: z.string(),
      keyInvalid: z.string(),
      deleteBlocked: z.string(),
      deleteError: z.string(),
      /** Refusals by `code`, mostly races: the list checks the rest itself. */
      errors: z
        .object({
          'tier-not-found': z.string(),
          'tier-key-taken': z.string(),
          'tier-has-accounts': z.string(),
          'tier-has-prices': z.string(),
          'tier-is-default': z.string(),
        })
        .strict(),
    })
    .strict(),
  /** The attribute screens. */
  attributes: z
    .object({
      /** The filterable attributes (FR-ATTR-01). The two amber notes are the only
       * place a mistyped name shows before a filter goes missing. */
      list: z
        .object({
          deleteConfirm: confirmText,
          page: pageText,
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
          /** Slug, called what an admin sees it as: the key in a filter
           * URL. */
          slug: z.string(),
          slugPlaceholder: z.string(),
          slugInvalid: z.string(),
          values: z.string(),
          unparsed: z.string(),
          noMatch: z.string(),
          /** The two counts are the ways out of the row: the product grid
           * narrowed to the attribute, and the inventory expanded on it. */
          showProducts: z.string(),
          showUsage: z.string(),
          empty: z.string(),
          saveError: z.string(),
          nameRequired: z.string(),
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
      /** Every key and value the products carry (FR-ATTR-09); a rename here
       * rewrites the whole catalog. */
      inventory: z
        .object({
          page: pageText,
          toDefinitions: z.string(),
          /** The two states of the row's link to the registry: a key the shop
           * filters by leads to its definition, a freetext one is
           * deadened. */
          toDefinitionAria: z.string(),
          notFilterable: z.string(),
          values: z.string(),
          /** Marks a value that drops out of a number attribute's filter. */
          notNumeric: z.string(),
          /** Stands in for a value that is empty, so the row is not a
           * blank. */
          emptyValue: z.string(),
          showProducts: z.string(),
          renameKeyAria: z.string(),
          renameValueAria: z.string(),
          newTextAria: z.string(),
          /** Rename confirmation. `{from}`/`{to}` substituted. `mergeConfirm`
           * replaces it where the new text is already in use, since that is a
           * merge and not a correction. */
          renameTitle: z.string(),
          renameConfirm: z.string(),
          mergeConfirm: z.string(),
          /** After either, when deleted products carry the text too: they are
           * rewritten as well (FR-ADM-22). `{count}` substituted. */
          renameDeleted: z.string(),
          renameError: z.string(),
          empty: z.string(),
        })
        .strict(),
    })
    .strict(),
  /** The document screens. */
  documents: z
    .object({
      /** The shop's documents (FR-DOC-01). File sizes are formatted where they
       * are shown, not by the API. */
      list: z
        .object({
          deleteConfirm: confirmText,
          page: pageText,
          /** How many rows the list holds, filters applied. */
          count: z.string(),
          add: z.string(),
          searchAria: z.string(),
          searchPlaceholder: z.string(),
          clearSearch: z.string(),
          /** Column headings. */
          titleColumn: z.string(),
          fileColumn: z.string(),
          /** What a document's link is called in that column (FR-DOC-05),
           * beside the file's format. */
          link: z.string(),
          issuedColumn: z.string(),
          expiresColumn: z.string(),
          statusColumn: z.string(),
          updatedColumn: z.string(),
          /** In the expiry cell of a document that never comes due. */
          noExpiry: z.string(),
          /** The expiry states (FR-DOC-04), as badge and filter. `statusDue` is two
           * states at once: what the panel's count links to. */
          statusAll: z.string(),
          statusDue: z.string(),
          statusExpiring: z.string(),
          statusExpired: z.string(),
          statusValid: z.string(),
          filterStatus: z.string(),
          /** The link into the product grid narrowed to this document's
           * products, and the same control dead: nothing shows it yet.
           * `{count}` substituted. */
          productsColumn: z.string(),
          seeProducts: z.string(),
          noProducts: z.string(),
          empty: z.string(),
          /** Shown instead of `empty` when the search emptied the list. */
          noResults: z.string(),
          loadError: z.string(),
          deleteError: z.string(),
        })
        .strict(),
      /** Replacing a file is filling the same form again: that is how a re-issued
       * document supersedes the last. */
      editor: z
        .object({
          newTitle: z.string(),
          editTitle: z.string(),
          title: z.string(),
          titlePlaceholder: z.string(),
          titleHint: z.string(),
          /** What an empty date field says: a native one draws a different
           * thing in every engine, so the app draws its own. */
          datePlaceholder: z.string(),
          file: z.string(),
          /** The empty drop target, and the control on a row that already has
           * a file. */
          dropHint: z.string(),
          choose: z.string(),
          replace: z.string(),
          open: z.string(),
          removeFile: z.string(),
          fileHint: z.string(),
          uploadError: z.string(),
          /** The external link (FR-DOC-05) — a register entry, the issuer's
           * page. Optional beside the file, but one of the two is
           * required. */
          link: z.string(),
          linkPlaceholder: z.string(),
          linkHint: z.string(),
          openLink: z.string(),
          linkInvalid: z.string(),
          issuedAt: z.string(),
          expiresAt: z.string(),
          datesHint: z.string(),
          /** The product picker (FR-DOC-02), including the shift-click nobody finds
           * alone. */
          products: z
            .object({
              heading: z.string(),
              hint: z.string(),
              searchAria: z.string(),
              searchPlaceholder: z.string(),
              categoryAria: z.string(),
              allCategories: z.string(),
              /** The two views of one list. `{count}` substituted on `showLinked`. */
              showAll: z.string(),
              showLinked: z.string(),
              /** What the capped page is not showing. `{count}`/`{total}`. */
              more: z.string(),
              empty: z.string(),
              noneLinked: z.string(),
              loadError: z.string(),
            })
            .strict(),
          titleRequired: z.string(),
          fileOrLinkRequired: z.string(),
          expiryBeforeIssue: z.string(),
          saveError: z.string(),
          discardConfirm: z.string(),
          notFound: z.string(),
          errors: z
            .object({
              'document-not-found': z.string(),
              'document-product-not-found': z.string(),
            })
            .strict(),
        })
        .strict(),
    })
    .strict(),
  /** What an editor says where the catalog is owned by an automated source
   * (FR-ADM-10). */
  ownership: z
    .object({
      /** The banner at the top of an editor: why, and where to change it. */
      fieldLocked: z.string(),
      /** The same fact in one clause, for the mark beside each locked field. */
      fieldLockedShort: z.string(),
      /** The delete dialog, where reassigning would move products. */
      categoryHasProducts: z.string(),
      /** The same, where only deleted products are left in it, which no run
       * will move (FR-ADM-22). `{count}` substituted. */
      categoryHasDeletedProducts: z.string(),
      /** Restore on a product a run deleted: only a run brings it back. */
      productRestoreTitle: z.string(),
      productRestore: z.string(),
      /** Delete permanently refused for a product an admin hid while the
       * source still sends it (FR-ADM-21). */
      productPurge: z.string(),
      /** The product editor, opened on the "new" route. */
      productCreate: z.string(),
      /** The tier list, where only an existing list's sync key is locked. */
      tierKeyLocked: z.string(),
    })
    .strict(),
};

export type AdminCatalogText = DeepReadonly<
  z.infer<z.ZodObject<typeof adminCatalogTextShape>>
>;
