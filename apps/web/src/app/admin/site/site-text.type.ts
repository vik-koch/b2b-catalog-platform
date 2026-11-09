import * as z from 'zod';

import type { DeepReadonly } from '@b2b-catalog-platform/shared/platform';

/** The site's block of `texts/admin.json`. */
export const adminSiteTextShape = {
  /** Inline static-page editing (FR-ADM-03). */
  pages: z
    .object({
      /** Editor headings: a page with no row yet vs one being changed. */
      newTitle: z.string(),
      editTitle: z.string(),
      pageTitle: z.string(),
      previewNotice: z.string(),
      discardConfirm: z.string(),
      titleRequired: z.string(),
      saveError: z.string(),
      /** A consent page's box wording, saved with its text (NFR-LEGAL-09). */
      consentLabel: z.string(),
      consentLabelHint: z.string(),
      consentLabelRequired: z.string(),
      /** The wording has no bracketed link, or more than one. */
      consentLabelLink: z.string(),
      /** Above the box as the preview shows it on a form. */
      consentPreview: z.string(),
      /** The read-only list of past saves. */
      history: z
        .object({
          heading: z.string(),
          /** `{version}` substituted. */
          version: z.string(),
          current: z.string(),
          consentLabel: z.string(),
        })
        .strict(),
    })
    .strict(),
  /** The admin-panel control that gates the storefront (FR-ADM-04). */
  maintenance: z
    .object({
      description: z.string(),
      statusOn: z.string(),
      statusOff: z.string(),
      enableAria: z.string(),
      disableAria: z.string(),
      error: z.string(),
    })
    .strict(),
};

export type AdminSiteText = DeepReadonly<
  z.infer<z.ZodObject<typeof adminSiteTextShape>>
>;
