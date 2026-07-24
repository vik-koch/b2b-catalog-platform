import { DeepReadonly } from '@b2b-catalog-platform/shared/node';
import { z } from 'zod';

/**
 * Frontend-only UI text — the human-readable chrome wording (nav labels,
 * consent copy, error messages, taglines). A single-locale catalog: each
 * deployment ships its one language's text here (i18n is out of scope). Kept
 * separate from DeploymentConfig so growing text has its own home and a
 * deployment can override the whole catalog as one unit.
 *
 * Delivered SSR → browser via TransferState (see app-text.server.ts), so a
 * per-deployment override is a runtime concern, not a rebuild. Non-secret by
 * construction: the browser renders it.
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
    /**
     * Temporary text for homepage (will be removed in iteration 2).
     */
    home: z
      .object({
        line1: z.string(),
        line2: z.string(),
        line3: z.string(),
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
  })
  .strict();

export type AppText = DeepReadonly<z.infer<typeof appTextSchema>>;
