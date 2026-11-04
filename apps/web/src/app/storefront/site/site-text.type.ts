import type { DeepReadonly } from '@b2b-catalog-platform/shared/platform';
import * as z from 'zod';

/** The site's keys of `texts/storefront.json`. */
export const storefrontSiteTextShape = {
  map: z
    .object({
      /** In place of a map that waits for consent: who it comes from and
       * what loading it hands them. `{provider}` is `mapProvider`. */
      consentNotice: z.string(),
      /** Loads the map, giving the consent the banner asks for. Left out,
       * the banner is the only way in. */
      load: z.string().optional(),
    })
    .strict(),
  consent: z
    .object({
      /** The cookie banner; `{provider}` is `mapProvider`. */
      message: z.string(),
      policyLink: z.string(),
      /** Straight after the link, as `privacyNotice.after`. */
      policyLinkAfter: z.string(),
      accept: z.string(),
      reject: z.string(),
      settings: z.string(),
    })
    .strict(),
  /** Under a legal page's text, when it last changed: `{date}`. */
  pageUpdated: z.object({ label: z.string() }).strict(),
  /** On a form that takes personal details (NFR-LEGAL-01): information, not
   * agreement, so it sits outside the consent box. `link` follows `text`. */
  privacyNotice: z
    .object({
      text: z.string(),
      link: z.string(),
      /** Straight after the link, with no space: its closing punctuation,
       * empty where the language puts none there. */
      after: z.string(),
    })
    .strict(),
  /** Beside checkout's submit: sending the order accepts the terms
   * (NFR-LEGAL-10). */
  termsNotice: z
    .object({ text: z.string(), link: z.string(), after: z.string() })
    .strict(),
  /** Beside a consent box (NFR-LEGAL-09). The box's own wording is
   * versioned with the consent text an admin edits. */
  consentBox: z
    .object({
      required: z.string(),
      /** The text changed while the form was open. */
      changed: z.string(),
      /** The deployment asks for a consent whose text was never written. */
      unavailable: z.string(),
    })
    .strict(),
  inquiry: z
    .object({
      intro: z.string(),
      preferredContact: z.string(),
      preferredEmail: z.string(),
      preferredPhone: z.string(),
      message: z.string(),
      submit: z.string(),
      success: z.string(),
      error: z.string(),
    })
    .strict(),
  /** The attribution page's framing; the list is the build's notice file.
   * `unavailable` is a build that extracted none (development). */
  licenses: z
    .object({
      intro: z.string(),
      unavailable: z.string(),
      unknownLicense: z.string(),
    })
    .strict(),
  /** The 503 screen while the storefront is gated (FR-ADM-04). */
  maintenance: z
    .object({
      title: z.string(),
      body: z.string(),
    })
    .strict(),
};

export type StorefrontSiteText = DeepReadonly<
  z.infer<z.ZodObject<typeof storefrontSiteTextShape>>
>;
