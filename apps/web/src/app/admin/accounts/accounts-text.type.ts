import type { DeepReadonly } from '@b2b-catalog-platform/shared/platform';
import * as z from 'zod';
import { confirmText, pageText } from '../../platform/config/text-shapes';

/** The accounts' block of `texts/admin.json`. */
export const adminAccountsTextShape = {
  /** The account screens, customers and staff alike. */
  users: z
    .object({
      /**
       * The staff account list (FR-AUTH-03/04). Column headings double as the
       * sort/filter controls, so several of these are the accessible names of
       * a control whose visible text is the value in effect rather than a
       * label. The storefront list's name is not here either: it is that tier
       * row's own label, which is why the two screens cannot drift apart.
       */
      list: z
        .object({
          declineConfirm: confirmText,
          reactivateConfirm: confirmText,
          deactivateConfirm: confirmText,
          customersPage: pageText,
          staffPage: pageText,
          /** How many rows the list holds, filters applied. */
          count: z.string(),
          searchAria: z.string(),
          searchPlaceholder: z.string(),
          clearSearch: z.string(),
          empty: z.string(),
          /** Shown instead of `empty` when filters are what emptied the
           * list. */
          noResults: z.string(),
          loadError: z.string(),
          registered: z.string(),
          /** Accessible names for the column-heading filters. */
          filterRole: z.string(),
          filterTier: z.string(),
          /** Only rendered where the deployment configures several
           * formats. */
          filterCompanyIdFormat: z.string(),
          filterStatus: z.string(),
          roleAll: z.string(),
          roleAdmin: z.string(),
          roleManager: z.string(),
          roleUser: z.string(),
          tierAll: z.string(),
          companyIdFormatAll: z.string(),
          /** The accounts carrying no registration number — private
           * persons. */
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
          /** Row actions (FR-AUTH-03/04). `actionsAria` names the column for a
           * screen reader; the rest are the icon buttons' accessible names.
           * `{name}` in `declineConfirm` is substituted at render. */
          actionsAria: z.string(),
          approve: z.string(),
          edit: z.string(),
          declineAria: z.string(),
          /** Switching an account off and on again. `{name}` is
           * substituted. */
          deactivateAria: z.string(),
          reactivateAria: z.string(),
          saveError: z.string(),
          /** The two Add buttons — one per tab, since they create different
           * things and land on different forms. */
          addCustomer: z.string(),
          addStaff: z.string(),
          /**
           * Every refusal the account surface can answer with, keyed by the
           * API's own `code`. The editor reads these too, like the status and
           * role labels above: a refused approval says the same thing
           * wherever the click came from.
           */
          errors: z
            .object({
              'account-not-found': z.string(),
              'account-not-pending': z.string(),
              'account-closed': z.string(),
              'email-taken': z.string(),
              'account-not-approved': z.string(),
              'account-not-disabled': z.string(),
              'account-cannot-sign-in': z.string(),
              'self-deactivate': z.string(),
              'self-demote': z.string(),
              'last-admin': z.string(),
              'account-not-purgeable': z.string(),
              /** Deleting an account on request (FR-ADM-23). */
              'self-delete': z.string(),
              'account-pending': z.string(),
              /** Another account already carries that source key
               * (FR-ADM-14). */
              'source-id-taken': z.string(),
              /** The three a manager is refused, shown next to the field. */
              'role-change-admin-only': z.string(),
              'staff-create-admin-only': z.string(),
              'source-id-change-admin-only': z.string(),
              /** No account of this role may skip the sign-in code (FR-AUTH-12). */
              'not-exemptable': z.string(),
              /** A kind of customer the shop does not sell to (FR-AUTH-13). */
              'customer-type-not-accepted': z.string(),
            })
            .strict(),
        })
        .strict(),
      /**
       * The account editor (FR-AUTH-03/04) — add, edit and approve on one
       * screen. Status, role, tier and customer-type *labels* are read from
       * `userList` rather than repeated here: they name the same things, and
       * two copies is how they drift apart.
       */
      editor: z
        .object({
          newCustomerTitle: z.string(),
          newStaffTitle: z.string(),
          editTitle: z.string(),
          /** Heading while the account is still awaiting a decision. */
          approveTitle: z.string(),
          /** Why the address is shown but not editable. */
          emailFixed: z.string(),
          customerType: z.string(),
          /** Above the form of an account stored as a kind of customer the
           * shop no longer sells to (FR-AUTH-13). */
          typeNotAccepted: z.string(),
          tier: z.string(),
          tierChoose: z.string(),
          role: z.string(),
          /**
           * The source system's key for this customer (FR-ADM-14), shown to
           * an admin only. `sourceIdHint` says what it is for, because it is
           * the one field on this screen whose effect is on a system the
           * person reading it cannot see: an account with no key is invisible
           * to the exchange, and filling it in is how a self-registered
           * customer joins.
           */
          sourceId: z.string(),
          sourceIdHint: z.string(),
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
              tierRequired: z.string(),
            })
            .strict(),
        })
        .strict(),
      /**
       * One account, read rather than edited (FR-AUTH-03/04) — the same
       * surface a customer sees of their own record, plus the two facts they
       * never see: what price list they are on, and what key an exchange
       * knows them by.
       *
       * Only what this screen says *itself* is here. Every field name,
       * status, role and tier label is `userList`'s or `userEditor`'s, for
       * the reason those two already share them: one thing, named once.
       */
      detail: z
        .object({
          unexemptConfirm: confirmText,
          exemptConfirm: confirmText,
          deleteConfirm: confirmText,
          detailsHeading: z.string(),
          accountHeading: z.string(),
          /** When the registration was decided, and the line for one that has
           * not been — a pending account is not an account with a missing date. */
          approved: z.string(),
          approvedNever: z.string(),
          /** Said in full rather than as a dash: an empty source key is what
           * makes an account invisible to the exchange, which is worth a
           * sentence on the one screen that shows the field. */
          sourceIdEmpty: z.string(),
          /** A customer's consent records (NFR-LEGAL-09). */
          consentsHeading: z.string(),
          consentsEmpty: z.string(),
          /**
           * Deleting the account on the person's request (FR-ADM-23).
           * `{name}` is substituted in the confirmation; the tick is offered
           * only where the account consent is asked, and records the reason.
           */
          delete: z.string(),
          deleteConsentWithdrawn: z.string(),
          deleteConsentWithdrawnHint: z.string(),
          deleteError: z.string(),
          /**
           * The code after the password (FR-AUTH-12), on accounts the
           * deployment asks for one. `{date}` is a date, `{admin}` the
           * exempting admin's address, `{name}` the account's name in the
           * confirmations.
           */
          signInHeading: z.string(),
          signInPhone: z.string(),
          signInPhoneConfirmed: z.string(),
          signInPhoneUnconfirmed: z.string(),
          /** No number a code can reach: the holder cannot sign in. */
          signInPhoneMissing: z.string(),
          signInCode: z.string(),
          signInCodeAlways: z.string(),
          /** At `always` where a browser may be remembered; `{days}`. */
          signInCodeAlwaysRemembered: z.string(),
          signInCodeOnce: z.string(),
          signInCodeExempt: z.string(),
          exempt: z.string(),
          unexempt: z.string(),
          exemptError: z.string(),
          back: z.string(),
          notFound: z.string(),
          loadError: z.string(),
        })
        .strict(),
    })
    .strict(),
  /**
   * Finding a person's consent records (NFR-LEGAL-09) by email address or
   * phone number, and how one record reads wherever it is listed.
   */
  consents: z
    .object({
      withdrawConfirm: confirmText,
      page: pageText,
      /** The admin panel's row to the lookup. */
      panelLookup: z.string(),
      /** The panel's row to a consent text; `{purpose}` names it. */
      panelText: z.string(),
      byEmail: z.string(),
      byPhone: z.string(),
      search: z.string(),
      /** `{query}` is what was searched for. */
      empty: z.string(),
      loadError: z.string(),
      purposes: z.object({ contact: z.string(), account: z.string() }).strict(),
      /** `{version}` is the consent text's version number. */
      version: z.string(),
      /** The account the record was given for. */
      account: z.string(),
      /** A record of an account that no longer exists: a declined
       * registration. */
      accountGone: z.string(),
      /** The badge on a record that has ended. */
      withdrawn: z.string(),
      /** `{date}` is when it ended; the reason follows. */
      withdrawnAt: z.string(),
      withdrawnReasons: z
        .object({
          'account-deleted': z.string(),
          'registration-declined': z.string(),
          /** `{admin}` is the address of whoever entered it. */
          entered: z.string(),
        })
        .strict(),
      /** Beside an account consent still held: how it would end. */
      endsWithAccount: z.string(),
      withdraw: z.string(),
      withdrawNote: z.string(),
      withdrawErrors: z
        .object({
          'consent-not-found': z.string(),
          'consent-already-withdrawn': z.string(),
          'consent-ends-with-account': z.string(),
        })
        .strict(),
      withdrawError: z.string(),
    })
    .strict(),
  /**
   * Where the customers are owned by an automated source (FR-ADM-10). The
   * area is closed whole rather than field by field, so this is one banner
   * and three refusals: an editor whose every input is greyed needs no label
   * on each.
   */
  ownership: z
    .object({
      accountLocked: z.string(),
      /** The editor opened on a "new customer" route, which explains
       * instead of rendering a form. */
      accountCreate: z.string(),
      /** The list's decline dialog, which explains instead of asking. */
      accountDecline: z.string(),
      /** The list's deactivate and reactivate dialogs, likewise. */
      accountActive: z.string(),
    })
    .strict(),
};

export type AdminAccountsText = DeepReadonly<
  z.infer<z.ZodObject<typeof adminAccountsTextShape>>
>;
