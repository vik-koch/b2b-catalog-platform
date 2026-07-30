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
 *
 * This is the *public* half: everything a logged-out visitor can reach, which
 * includes the login form and the maintenance screen. Wording behind an admin
 * session lives in AdminText, which is fetched rather than injected — see
 * admin-text.type.ts.
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
