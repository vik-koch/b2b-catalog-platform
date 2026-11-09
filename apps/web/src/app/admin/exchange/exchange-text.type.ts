import * as z from 'zod';

import type { DeepReadonly } from '@b2b-catalog-platform/shared/platform';

import { confirmText, pageText } from '../../platform/config/text-shapes';

/** The heading and standfirst of one area's sync log. */
const syncAreaTextSchema = z
  .object({ title: z.string(), runsDescription: z.string() })
  .strict();

/**
 * One ownership area's copy. The two directions carry a warning each because
 * they are opposite losses: handing over takes the shop's own way in away,
 * taking back starts refusing the system that has been doing the work.
 */
const ownershipAreaText = z
  .object({
    name: z.string(),
    description: z.string(),
    /** What follows from the state, said beside the badge that names it. */
    ownedEffect: z.string(),
    ownEffect: z.string(),
    handTitle: z.string(),
    handConfirm: z.string(),
    handWarning: z.string(),
    takeTitle: z.string(),
    takeConfirm: z.string(),
    takeWarning: z.string(),
  })
  .strict();

/** The exchange's block of `texts/admin.json`. */
export const adminExchangeTextShape = {
  /**
   * Bulk catalog sync (FR-ADM-02): the run's intent, the diff preview, the
   * delete confirmation and the run history. The `mode`/`option`/`count`/
   * `kind`/`status`/`col` groups are indexed dynamically from the screen's
   * own `as const` keys, so a missing key is a compile error, not a blank.
   */
  sync: z
    .object({
      discardConfirm: confirmText,
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
          taxRate: z.string(),
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
      /** Why the whole file was refused, keyed by the API's `code`. The
       * response supplies the file's names (`{column}`, `{columns}`,
       * `{expected}`, `{rows}`, `{limit}`, `{row}`). */
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
          /** Not a fault in the file: the catalog is externally owned
           * (FR-ADM-10) and the upload is closed. */
          'catalog-externally-owned': z.string(),
          /** The same, said of the customer import (FR-ADM-12). */
          'customers-externally-owned': z.string(),
        })
        .strict(),
      /** The diff. `{count}` substituted at render. */
      summaryTitle: z.string(),
      /** The same panel, once the run is a record rather than a decision. */
      summaryTitleApplied: z.string(),
      /** The count tiles. Their first four name a row's change as well, as
       * its badge: a tile counts the rows wearing it. */
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
      /** Why one row was skipped, keyed by the API's `code`. The response
       * quotes the file (`{category}`, `{price}`, `{column}`, `{key}`,
       * `{known}`, `{first}`, `{second}`, `{name}`). */
      rowErrors: z
        .object({
          'missing-source-id': z.string(),
          'duplicate-source-id': z.string(),
          'category-id-without-name': z.string(),
          'category-name-without-id': z.string(),
          'price-not-an-integer': z.string(),
          /** `{column}`: a zero price, stored as none. */
          'price-is-zero': z.string(),
          'stock-not-an-integer': z.string(),
          'tax-rate-invalid': z.string(),
          'unknown-price-list': z.string(),
          'category-name-conflict': z.string(),
          'unknown-category': z.string(),
          'cannot-create-product': z.string(),
        })
        .strict(),
      truncated: z.string(),
      nothingToApply: z.string(),
      /** The same, said about a run that has already happened. */
      nothingChanged: z.string(),
      /** The customer exchange's own words (FR-ADM-11): counts of accounts,
       * rows that are people. What a run says of itself is shared above. */
      customers: z
        .object({
          accountsTitle: z.string(),
          /**
           * The manual import (FR-ADM-12), which is the catalog upload's
           * sibling screen and needs its own three sentences: what the file
           * is for, what a preset means, and which columns to write.
           * `fileHint` substitutes `{columns}`, listed by the contract so the
           * wording cannot go out of date without anything failing.
           */
          uploadTitle: z.string(),
          uploadDescription: z.string(),
          /** The file field's own label: the catalog's says "catalog". */
          file: z.string(),
          fileHint: z.string(),
          /** Presets over the individual options. */
          mode: z
            .object({
              full: z.string(),
              fullHint: z.string(),
              tiers: z.string(),
              tiersHint: z.string(),
              custom: z.string(),
            })
            .strict(),
          /** Individual options, in the order the form shows them. */
          option: z
            .object({
              email: z.string(),
              tier: z.string(),
              company: z.string(),
              createMissing: z.string(),
              updateExisting: z.string(),
              claimByEmail: z.string(),
            })
            .strict(),
          /** The count tiles, in this area's reading of them. A row's badge
           * is the tile that counts it. */
          count: z
            .object({
              create: z.string(),
              update: z.string(),
              softDelete: z.string(),
              restore: z.string(),
              claimed: z.string(),
              claimedById: z.string(),
              mailed: z.string(),
              unchanged: z.string(),
              errors: z.string(),
            })
            .strict(),
          /** Field names as a diff line labels them, and as the log lists
           * what a run rewrote. */
          field: z
            .object({
              email: z.string(),
              tier: z.string(),
              customerType: z.string(),
              companyName: z.string(),
              companyId: z.string(),
            })
            .strict(),
          /** Said beside a row this run would mail a set-a-password link to. */
          mailedRow: z.string(),
          /**
           * Why a single row was skipped, keyed by the API's own `code`.
           * `{email}`, `{key}` and `{known}` come from the response.
           */
          rowErrors: z
            .object({
              'missing-source-id': z.string(),
              'duplicate-source-id': z.string(),
              'duplicate-email': z.string(),
              'email-taken': z.string(),
              /** An account without a source key holds that address: almost
               * certainly this person, registered here (FR-ADM-17). */
              'account-unclaimed': z.string(),
              /** `{accountId}`: the row named an account that is not here. */
              'account-unknown': z.string(),
              /** `{accountId}`: the account it named is already somebody's
               * in the source system. */
              'account-already-keyed': z.string(),
              /** `{accountId}` and `{email}`: claimable, on a run not
               * allowed to claim by identifier. */
              'account-unclaimed-by-id': z.string(),
              'unknown-tier': z.string(),
              'cannot-create-account': z.string(),
              /** Closed by the person themselves; the key is kept so this
               * refusal can happen (FR-ADM-15). */
              'account-withdrawn': z.string(),
              'staff-account': z.string(),
              'cannot-send-link': z.string(),
              'company-details-incomplete': z.string(),
              /** `{type}`: a kind the shop does not sell to (FR-AUTH-13). */
              'customer-type-not-accepted': z.string(),
              /** `{column}` and `{value}`: a cell the column cannot hold
               * (FR-ADM-12). */
              'invalid-value': z.string(),
            })
            .strict(),
          /** The gate before a run that takes people's access away. `{count}`. */
          disableWarning: z.string(),
          /** The gate before a run adopting accounts registered here, with
           * `{count}`: a claim fixes what a key means from then on. */
          claimWarning: z.string(),
          /** The same gate for an adoption the source system named by
           * identifier. Its own sentence because the evidence is a different
           * one, and a reader weighing a staged run is weighing exactly
           * that. `{count}`. */
          claimByIdWarning: z.string(),
        })
        .strict(),
      /** The order exchange's words (FR-ADM-08), the shortest: a run is
       * applied as it arrives, so no preset, option or gate, only what it
       * did. */
      orders: z
        .object({
          ordersTitle: z.string(),
          /** The count tiles, in this area's reading of them. */
          count: z
            .object({
              /** Orders this run answered. */
              update: z.string(),
              /** Orders that already said what it said (FR-ADM-16). */
              unchanged: z.string(),
              mailed: z.string(),
              errors: z.string(),
            })
            .strict(),
          /** What one answer was, used as a row badge. */
          kind: z
            .object({
              /** What the order says changed. */
              adjustment: z.string(),
              /** Only its status moved. */
              transition: z.string(),
              /** Only the money was recorded. */
              payment: z.string(),
            })
            .strict(),
          /** What a run wrote, as the log lists it. */
          field: z
            .object({
              status: z.string(),
              lines: z.string(),
              payment: z.string(),
            })
            .strict(),
          /** Said beside a row whose customer was written to. */
          notifiedRow: z.string(),
          /**
           * Why a single instruction was refused, keyed by the API's own
           * `code`. `{reference}`, `{current}` and `{productSourceId}` come
           * from the response.
           */
          rowErrors: z
            .object({
              'order-not-found': z.string(),
              'duplicate-reference': z.string(),
              /** `{current}`: the order moved since the source read it. */
              'order-changed': z.string(),
              /** The customer called it off, which they may do however the
               * area is owned (FR-ADM-10). */
              'order-called-off': z.string(),
              /** A restore that would not tell the customer. */
              'restore-not-announced': z.string(),
              /** Its personal details are gone; it is finished for good. */
              'personal-data-removed': z.string(),
              'transition-not-allowed': z.string(),
              'reason-required': z.string(),
              /** `{productSourceId}`: no product carries that key. */
              'unknown-product': z.string(),
              'duplicate-product': z.string(),
              'payment-not-recordable': z.string(),
            })
            .strict(),
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
          'run-no-change': z.string(),
          /** Uploaded before the catalog was handed over, applied after. */
          'catalog-externally-owned': z.string(),
          /** The same, for an uploaded customer run (FR-ADM-12). */
          'customers-externally-owned': z.string(),
          'run-superseded': z.string(),
          'run-discarded': z.string(),
          'run-rows-pruned': z.string(),
        })
        .strict(),
      applied: z.string(),
      discard: z.string(),
      /** The run log's empty state + the dashboard's last-sync line. */
      historyEmpty: z.string(),
      historyCount: z.string(),
      col: z
        .object({
          date: z.string(),
          file: z.string(),
          actor: z.string(),
          status: z.string(),
          changes: z.string(),
        })
        .strict(),
      /** The manual upload, which is now a screen of its own reached from
       * the log. */
      uploadTitle: z.string(),
      newRun: z.string(),
      backToRuns: z.string(),
      /** Each area's log name and description: one screen serves all, so
       * only the heading is per area. */
      areas: z
        .object({
          catalog: syncAreaTextSchema,
          customers: syncAreaTextSchema,
          orders: syncAreaTextSchema,
        })
        .strict(),
      /** What ran it, where there is no person: an upload says so, and a
       * machine run is named by its token. */
      sourceUpload: z.string(),
      /** One run's own page. */
      runTitle: z.string(),
      runLoadError: z.string(),
      planUnavailable: z.string(),
      failureTitle: z.string(),
      /** A run that worked and still had something to say for itself. */
      noticeTitle: z.string(),
      startedLabel: z.string(),
      finishedLabel: z.string(),
      /** Giving up on a staged run, and the question asked first. */
      discardRun: z.string(),
      status: z
        .object({
          previewed: z.string(),
          applied: z.string(),
          failed: z.string(),
          'no-change': z.string(),
          superseded: z.string(),
          discarded: z.string(),
        })
        .strict(),
      /** The status filter's own wording: the unfiltered option names the
       * column on a desktop, so it is the heading as well. */
      statusAll: z.string(),
      filterStatus: z.string(),
      /** What a catalogue run rewrote, under its counts. Each price column
       * names its list through `priceList`, the storefront's too: which
       * lists a feed writes is what an admin checks. */
      field: z
        .object({
          name: z.string(),
          category: z.string(),
          stock: z.string(),
          taxRate: z.string(),
          priceList: z.string(),
        })
        .strict(),
      /** `{count}`: the fields a narrow column has no room for. */
      moreFields: z.string(),
      /** A tax rate to or from the deployment's default: the plan's word for
       * a null rate. */
      taxRateDefault: z.string(),
      /** Why a run is waiting, said in the log and on the run's own page. */
      stagedReason: z
        .object({ policy: z.string(), requested: z.string() })
        .strict(),
    })
    .strict(),
  /** Machine tokens (NFR-SEC-09). A value shown once cannot be taken back,
   * so the created-token panel gets three lines. */
  apiTokens: z
    .object({
      revokeConfirm: confirmText,
      page: pageText,
      add: z.string(),
      create: z.string(),
      name: z.string(),
      namePlaceholder: z.string(),
      nameRequired: z.string(),
      scope: z.string(),
      scopeHint: z.string(),
      scopeRequired: z.string(),
      /** What each capability lets a token do, keyed by the contract's own
       * scope values. A new scope is a release, so a missing key here is a
       * config error rather than a fallback. */
      /** One line per capability, keyed by scope: a missing one stops the
       * config loading, not a blank cell. */
      /**
       * The two columns the capabilities are laid out in: what a credential
       * may read out of the shop, and what it may send into it.
       */
      scopeKind: z.object({ read: z.string(), submit: z.string() }).strict(),
      /** The rows: which area of the shop's data a capability is about. */
      scopeArea: z
        .object({
          catalog: z.string(),
          customers: z.string(),
          orders: z.string(),
        })
        .strict(),
      scopes: z
        .object({
          'catalog-sync': z.string(),
          'customer-sync': z.string(),
          'customer-read': z.string(),
          'order-read': z.string(),
          'order-sync': z.string(),
        })
        .strict(),
      /** The panel that shows the value. `{name}` substituted at render. */
      createdHeading: z.string(),
      createdOnce: z.string(),
      copy: z.string(),
      copied: z.string(),
      active: z.string(),
      revoked: z.string(),
      /** Per-row facts. `{date}` and `{actor}` substituted at render. */
      created: z.string(),
      lastUsed: z.string(),
      neverUsed: z.string(),
      empty: z.string(),
      createError: z.string(),
      /** Revocation, the only destructive act here: a revoked token is
       * replaced, never restored. */
      revokeAria: z.string(),
      revokeError: z.string(),
    })
    .strict(),
  /** The switch handing an area to an external system (FR-ADM-10), and its
   * refusals across screens. Its page is `operations` below. */
  ownership: z
    .object({
      intro: z.string(),
      /** One area's whole vocabulary in one block, so a new area is one
       * block to write and translate, and a half-worded one a type error. */
      areaText: z
        .object({
          catalog: ownershipAreaText,
          customers: ownershipAreaText,
          orders: ownershipAreaText,
        })
        .strict(),
      statusOwned: z.string(),
      statusOwn: z.string(),
      hand: z.string(),
      take: z.string(),
      /** The master switch, read over the areas and acting across them,
       * never a stored flag; it also names areas that disagree. */
      all: z
        .object({
          heading: z.string(),
          description: z.string(),
          statusMixed: z.string(),
          /** `{count}` of `{total}` areas, for the mixed state. */
          statusMixedEffect: z.string(),
          hand: z.string(),
          take: z.string(),
          handTitle: z.string(),
          handConfirm: z.string(),
          handWarning: z.string(),
          takeTitle: z.string(),
          takeConfirm: z.string(),
          takeWarning: z.string(),
          /** The lid over the per-area rows. */
          areasToggle: z.string(),
        })
        .strict(),
      error: z.string(),
      /**
       * A staged upload opened after its area was handed over: the apply is
       * judged by the setting in force now, so the button is gone and this
       * is what stands in its place. Discarding it stays possible.
       */
      runStranded: z.string(),
    })
    .strict(),
};

export type AdminExchangeText = DeepReadonly<
  z.infer<z.ZodObject<typeof adminExchangeTextShape>>
>;
