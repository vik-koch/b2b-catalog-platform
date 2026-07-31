import { PAGE_SLUGS, pageSlugSchema } from '@b2b-catalog-platform/shared';
import { DeepReadonly } from '@b2b-catalog-platform/shared/node';
import { z } from 'zod';

/**
 * A map embed — restricted to an iframe URL by design.
 */
export const mapEmbedSchema = z
  .object({
    /**
     * iframe src. Deployment-owned, so trusted — bound as a resource URL.
     * OpenStreetMap/static for the demo; a provider endpoint per deployment.
     */
    url: z.string(),
    /**
     * Set when the embed sets cookies / loads tracking (e.g. Google Maps), so
     * it is withheld until consent allows it. Omit for no-cookie embeds (static
     * images, some map tiles), which render immediately.
     */
    consentRequired: z.boolean().optional(),
  })
  .strict();

export type MapEmbed = DeepReadonly<z.infer<typeof mapEmbedSchema>>;

/** One office/branch shown on the contact page. */
export const contactLocationSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    map: mapEmbedSchema,
  })
  .strict();

export type ContactLocation = DeepReadonly<
  z.infer<typeof contactLocationSchema>
>;

/**
 * Per-deployment configuration for the app chrome — branding/identity and
 * feature flags.
 *
 * Injected into every document the Node process serves (see shell-state.ts) —
 * no separate public config endpoint, no runtime fetch. Non-secret by
 * construction: the browser needs them to render.
 */
export const deploymentConfigSchema = z
  .object({
    branding: z
      .object({
        name: z.string(),
        /**
         * Document `<title>` for the whole site, set at runtime by the root
         * component via the Angular Title service (so SSR emits it and crawlers
         * see it).
         */
        title: z.string(),
        /**
         * First year of the copyright range in the footer. The end of the range
         * is the current year, so it never needs maintaining; a shop that
         * launched this year shows a single year rather than a range.
         */
        startYear: z.number().int(),
        /**
         * Semantic color tokens. The three brand colors are required; the
         * neutrals default to the stone ramp in styles.css and are only worth
         * setting for a deployment whose palette is not warm-gray.
         */
        theme: z
          .object({
            primary: z.string(),
            secondary: z.string(),
            accent: z.string(),
            surface: z.string().optional(),
            ink: z.string().optional(),
            /** Secondary body copy. */
            muted: z.string().optional(),
            /** Meta text: eyebrows, table headers, counts. */
            subtle: z.string().optional(),
            /** Structural lines: card edges, dividers, table rules. */
            border: z.string().optional(),
            /** Control edges: inputs, secondary buttons. */
            borderStrong: z.string().optional(),
          })
          .strict(),
      })
      .strict(),
    /**
     * Which static pages this deployment has, and where they are linked.
     *
     * The slug set is fixed in code (PAGE_SLUGS); what varies per deployment is
     * which of them exist and where they appear — whether a separate imprint
     * page is required, for instance, differs by jurisdiction, and the same
     * details are often carried on an about or contact page instead.
     *
     * An unpublished page is unreachable everywhere at once: its route stops
     * matching, it drops out of both navigations, the admin panel stops
     * offering it, and it leaves the sitemap. Its row stays in the database, so
     * publishing it again is a config change rather than a restore.
     */
    pages: z
      .object({
        /** Page bodies this deployment serves. */
        published: z.array(pageSlugSchema),
        /**
         * Route segments in the header's utility bar and the footer's legal
         * nav, in the order they appear. Page slugs must be published; code
         * routes (`contact`) may be listed either way.
         */
        headerNav: z.array(z.string()),
        footerNav: z.array(z.string()),
      })
      .strict()
      .superRefine((pages, ctx) => {
        // A link to an unpublished page would render a 404 into the chrome of
        // every page, so this is worth failing the boot over.
        const published = new Set<string>(pages.published);
        const isPage = (s: string): boolean =>
          (PAGE_SLUGS as readonly string[]).includes(s);
        for (const key of ['headerNav', 'footerNav'] as const) {
          for (const segment of pages[key]) {
            if (isPage(segment) && !published.has(segment)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [key],
                message: `"${segment}" is linked but not published`,
              });
            }
          }
        }
      }),
    /**
     * Whether cookie-consent gating is enforced. When false, no banner is shown
     * and non-essential storage is not gated — correct both while the app sets
     * only strictly-necessary storage, and for deployments in jurisdictions
     * without consent requirements (optional storage just loads).
     */
    cookieConsentEnabled: z.boolean(),
    /**
     * Catalog presentation. Prices come from the API as integer minor units and
     * are currency-agnostic; this is where a deployment names its single
     * currency and how to format it. `locale` is required so formatting is
     * deterministic under SSR (symbol placement and grouping differ per locale)
     * — it matches the deployment's one shipped locale.
     */
    catalog: z
      .object({
        currency: z
          .object({
            /** ISO 4217 code, e.g. "EUR". Drives symbol and fraction digits. */
            code: z.string(),
            /** BCP 47 locale for number formatting, e.g. "de-DE". */
            locale: z.string(),
          })
          .strict(),
      })
      .strict(),
    /**
     * Offices shown on the contact page.
     */
    locations: z.array(contactLocationSchema),
    /**
     * Primary contact shown in the header bar and footer. Each field is
     * optional — an omitted field is simply not rendered; omit the whole object
     * for none.
     */
    contact: z
      .object({
        phone: z.string().optional(),
        email: z.string().optional(),
      })
      .strict()
      .optional(),
    /**
     * Phone-number input for the inquiry form. The country code is fixed and
     * shown as a prefix the visitor does not type. The optional mask formats the
     * national part as they type — `#` is one digit, any other character is a
     * literal separator.
     */
    phoneInput: z
      .object({
        countryCode: z.string(),
        mask: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type DeploymentConfig = DeepReadonly<
  z.infer<typeof deploymentConfigSchema>
>;
