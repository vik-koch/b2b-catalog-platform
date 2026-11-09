import * as z from 'zod';

import type { DeepReadonly } from '@b2b-catalog-platform/shared/platform';

/**
 * The keys of `texts/storefront.json` no area claims. The file is what a
 * logged-out visitor can reach, injected into every document; wording behind
 * an admin session is in `texts/admin.json`, fetched instead.
 */
export const storefrontTextShape = {
  /** Storefront landing (FR-CAT-01): intro above the category showcase; the
   * heading is `branding.tagline`. */
  home: z
    .object({
      eyebrow: z.string(),
      intro: z.string(),
      /** Over the category index, below the white band. */
      categoriesHeading: z.string(),
    })
    .strict(),
  /**
   * Footer chrome. `copyright` carries the whole line so a deployment owns
   * the symbol and word order; `{name}` and `{years}` are substituted at
   * render (years is either "2025–2026" or a single year).
   */
  footer: z
    .object({
      copyright: z.string(),
    })
    .strict(),
  /**
   * Text only assistive technology reads: landmark names and the accessible
   * names of controls whose visible content is an icon or a logo. It is still
   * user-facing copy in one language, so it belongs here rather than baked
   * into templates.
   */
  a11y: z
    .object({
      /** Accessible name of the logo's home link; `{name}` is substituted. */
      homeLink: z.string(),
      /** Landmark names for the navigations and the consent banner. */
      utilityNav: z.string(),
      primaryNav: z.string(),
      legalNav: z.string(),
      consentBanner: z.string(),
      /** Floating back-to-top control. */
      scrollToTop: z.string(),
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
};

export type StorefrontText = DeepReadonly<
  z.infer<z.ZodObject<typeof storefrontTextShape>>
>;
