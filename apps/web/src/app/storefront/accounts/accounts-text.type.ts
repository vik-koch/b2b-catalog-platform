import type { DeepReadonly } from '@b2b-catalog-platform/shared/platform';
import * as z from 'zod';
import { confirmText } from '../../platform/config/text-shapes';

/** The accounts' block of `texts/storefront.json`. */
export const storefrontAccountsTextShape = {
  /**
   * Login form, the navbar account link and the account page. One
   * vocabulary for all roles; staff land in the admin panel, whose own
   * wording is in the admin text.
   */
  auth: z
    .object({
      login: z.string(),
      logout: z.string(),
      /** The navbar label, the same for every role (accountNav). */
      accountNav: z.string(),
      /** What the account control's marker announces (FR-WORK-01): the dot
       * shows no figure, so `{count}` is spelled out only here. */
      workMarkerAria: z.string(),
      /** Heading of the change-password section on /account. The admin panel
       * has its own (`panel.securityHeading` in the admin text). */
      securityHeading: z.string(),
      account: z.string(),
      /** The password field, wherever an account's password is asked for. */
      password: z.string(),
      /** Offered to a guest after an order, on the confirmation and the mailed
       * link's page, where waiting for approval costs nothing. */
      registerInvite: z
        .object({ text: z.string(), action: z.string() })
        .strict(),
      submit: z.string(),
      submitting: z.string(),
      invalid: z.string(),
      /** A customer's right password during maintenance, when only staff
       * may in. */
      closed: z.string(),
      error: z.string(),
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
          companyIdHint: z.string(),
          submit: z.string(),
          /** Shown in place of the form once the request is in. */
          successHeading: z.string(),
          success: z.string(),
          error: z.string(),
          /** Link back to the login page from the register page. */
          haveAccount: z.string(),
        })
        .strict(),
      /** Redeeming a password link (FR-AUTH-01/02): where an invitation or a
       * reset mail lands. */
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
          confirmPassword: z.string(),
          /** Reveal toggle on the password field. */
          show: z.string(),
          hide: z.string(),
          /** Offers a strong password to anyone who does not want to invent one. */
          generate: z.string(),
          generated: z.string(),
          submit: z.string(),
          successHeading: z.string(),
          success: z.string(),
          /** The link was expired, already used, or never valid. */
          expiredHeading: z.string(),
          expired: z.string(),
          /** A customer's good link while maintenance mode is on. It is
           * left unspent, to be used once the shop opens. */
          closedHeading: z.string(),
          closed: z.string(),
          error: z.string(),
        })
        .strict(),
      /**
       * The code after the password (FR-AUTH-12), on the sign-in form and
       * after choosing a password from a link. `{sentTo}` is where the code
       * went, masked: the phone, or the email address where a deployment
       * delivers codes by mail. `{phone}` is the number being confirmed,
       * `{length}` the code's digits, `{time}` a wait as minutes:seconds and
       * `{count}` the tries left.
       */
      signInStep: z
        .object({
          codeHeading: z.string(),
          codeIntro: z.string(),
          /** Under the intro while the number is being confirmed. */
          confirmNote: z.string(),
          code: z.string(),
          codeRequired: z.string(),
          codeFormat: z.string(),
          submit: z.string(),
          resend: z.string(),
          /** The resend control while the wait runs. */
          resendIn: z.string(),
          resent: z.string(),
          wrong: z.string(),
          /** Past its time, or entered wrongly too often. */
          expired: z.string(),
          /** The pending sign-in itself ran out. */
          restart: z.string(),
          restartAction: z.string(),
          limit: z.string(),
          /** The box that remembers this browser; `{days}` is filled in. */
          remember: z.string(),
          /** Under the box: it skips the code, not the password. */
          rememberHint: z.string(),
          /** No number on the account the step can use: staff correct it. */
          unreachableAccount: z.string(),
          unavailable: z.string(),
          error: z.string(),
          /**
           * The call screen, where the deployment proves the number by a
           * call from it. `{callTo}` is the number to call, `{phone}` the
           * account's (masked), `{time}` a wait.
           */
          callHeading: z.string(),
          callIntro: z.string(),
          /** Where mail stands in for the call; `{sentTo}` is the address. */
          callByMail: z.string(),
          /** Under the intro while the number is being confirmed. */
          callConfirmNote: z.string(),
          /** The link a phone can dial. */
          callDial: z.string(),
          /** While the check is open; `{time}` is what is left of it. */
          callWaiting: z.string(),
          callExpired: z.string(),
          callNew: z.string(),
          /** The new-number control while the wait runs. */
          callNewIn: z.string(),
          callRenewed: z.string(),
          callLimit: z.string(),
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
          passwordRequired: z.string(),
          currentPasswordRequired: z.string(),
          newPasswordRequired: z.string(),
          /** Carries the minimum length; `{min}` is substituted at render. */
          newPasswordTooShort: z.string(),
          /** The ceiling, `{max}`: only a generator reaches it. */
          newPasswordTooLong: z.string(),
          confirmPasswordMismatch: z.string(),
        })
        .strict(),
      /** Why the server refused a password, keyed by the API's `code`, so
       * the browser restates no server wording. Both password forms read it:
       * one policy. */
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
  /**
   * The account holder's own area. Sections rather than one flat list,
   * because this is where addresses and order history land next.
   */
  account: z
    .object({
      /** The heading over the details card, which has none of its own. */
      detailsHeading: z.string(),
      customerType: z.string(),
      memberSince: z.string(),
      /** Beside the fields the holder cannot edit: those staff approved the
       * account on. */
      changeHint: z.string(),
      error: z.string(),
      /** Correcting your own name and phone number. */
      edit: z
        .object({
          action: z.string(),
          heading: z.string(),
          intro: z.string(),
          submit: z.string(),
          error: z.string(),
          /**
           * Under a number that receives sign-in codes (FR-AUTH-12):
           * shown, not offered, and who to ask to change it.
           */
          phoneLocked: z.string(),
        })
        .strict(),
      /**
       * The saved delivery/invoice addresses (FR-CART-04), and the page
       * that edits one. The fields themselves are `address`.
       */
      addresses: z
        .object({
          heading: z.string(),
          empty: z.string(),
          add: z.string(),
          /** The icon-only row buttons take their accessible name from
           * `{label}`, the address itself. */
          editAria: z.string(),
          removeAria: z.string(),
          /** `{label}` is the address's own name. */
          removeConfirm: confirmText,
          error: z.string(),
          newHeading: z.string(),
          editHeading: z.string(),
          intro: z.string(),
          submit: z.string(),
          saveError: z.string(),
          /** The book is full: a refusal the form explains. */
          limitReached: z.string(),
          unsupportedCountry: z.string(),
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
          /** Only while the shop still works on something for this
           * customer (FR-AUTH-06); `{count}` is how many. It refuses
           * nothing: the order stays, without the name, address and phone,
           * which is worth knowing before the button. */
          openOrders: z.string(),
          passwordHint: z.string(),
          submit: z.string(),
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
  /** Who a registration or an order is for, as the choice offers it. */
  partyChoice: z.object({ person: z.string(), company: z.string() }).strict(),
};

export type StorefrontAccountsText = DeepReadonly<
  z.infer<z.ZodObject<typeof storefrontAccountsTextShape>>
>;
