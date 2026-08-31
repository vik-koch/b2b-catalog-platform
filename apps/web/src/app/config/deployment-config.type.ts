import {
  addressConfigSchema,
  companyIdInputSchema,
  phoneInputSchema,
  deliveryConfigSchema,
  orderReferenceConfigSchema,
  PAGE_SLUGS,
  pageSlugSchema,
} from '@b2b-catalog-platform/shared';
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

/** One office/branch shown on the contact page. Where a customer reaches the
 * business — not necessarily where goods are collected, which is its own list
 * (`pickup`). */
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
 * One place an order may be collected from (FR-CART-07). Deliberately its own
 * list rather than the contact page's offices: goods are collected from a
 * warehouse or a depot as readily as from an office, and an office that takes
 * enquiries need not hand anything over. The two overlap in practice and are
 * kept separate anyway, because one is not a subset of the other.
 *
 * `key` is what an order snapshots alongside the name and address, so renaming
 * or removing a pickup point later leaves past orders readable.
 *
 * `mapUrl` is a link a visitor opens, not an iframe embed — a pickup point is
 * looked up in passing, and a map drawn into the form is a page of weight for
 * a question that is answered by a glance elsewhere.
 */
export const pickupLocationSchema = z
  .object({
    key: z.string().min(1).max(64),
    name: z.string(),
    /** Snapshotted onto the order, so it is required: an order that cannot say
     * where it was collected from is one nobody can act on. */
    address: z.string().min(1),
    /** Opening hours, which gate to use — whatever the name and the address do
     * not already say. */
    description: z.string().optional(),
    mapUrl: z.string().optional(),
  })
  .strict();

export type PickupLocation = DeepReadonly<z.infer<typeof pickupLocationSchema>>;

export const pickupConfigSchema = z
  .object({
    locations: z
      .array(pickupLocationSchema)
      .min(1)
      .superRefine((locations, ctx) => {
        const seen = new Set<string>();
        locations.forEach((location, index) => {
          if (seen.has(location.key)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [index, 'key'],
              // A duplicate key makes one of the two unreachable: an order
              // naming it would snapshot whichever the lookup found first.
              message: `pickup location ${location.key} is listed twice`,
            });
          }
          seen.add(location.key);
        });
      }),
  })
  .strict();

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
         * The intrinsic size of `assets/logo.svg`, copied off the file itself.
         * Not a display size — the header draws the logo 40px high whatever
         * these say. They are there to reserve its box before it arrives: an
         * <img> with neither dimension declared is zero wide until the file
         * loads, so the search field beside it takes the space and gives it
         * back a frame later. Cheap to keep right, and wrong only if the asset
         * is replaced with one of another shape.
         */
        logo: z
          .object({
            width: z.number().int().positive(),
            height: z.number().int().positive(),
          })
          .strict(),
        /**
         * The typeface, when a deployment wants one of its own. `family` is a
         * CSS font-family list, applied to everything the app draws; leaving it
         * out keeps the system stack, which is a real choice rather than a
         * fallback — no file to load and the shop looks native everywhere.
         *
         * `stylesheet` names a CSS file in the assets mount (see
         * config/README.md) that declares the @font-face rules the family needs;
         * the server links it into every document. Self-hosted on purpose: a
         * link to a font CDN makes every visitor's browser announce itself to a
         * third party before the page has drawn.
         */
        font: z
          .object({
            family: z.string().min(1),
            stylesheet: z.string().min(1).optional(),
          })
          .strict()
          .optional(),
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
     * Whether an order carries an invoice address of its own. Where a
     * deployment invoices to the address the goods go to — or, for a
     * self-pickup, to no address at all — checkout asks for none: no second
     * picker, no "send the invoice here as well", and nothing about an invoice
     * address on the read-back or the order afterwards. The order's own
     * billing columns are then empty, which is what the flag means.
     */
    billingAddressEnabled: z.boolean(),
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
        /** Units a box's volume and weight are measured in. Labels only — the
         * numbers are stored as entered. */
        boxUnits: z
          .object({
            volume: z.string(),
            weight: z.string(),
          })
          .strict(),
      })
      .strict(),
    /**
     * Offices shown on the contact page.
     */
    locations: z.array(contactLocationSchema),
    /**
     * Where an order may be collected (FR-CART-07). Optional: a deployment
     * that configures none does not offer self-pickup at all, which is why
     * this is absent rather than an empty list.
     */
    pickup: pickupConfigSchema.optional(),
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
    phoneInput: phoneInputSchema.optional(),
    /**
     * The business registration number a company gives when it registers
     * (FR-AUTH-01). Jurisdiction-specific, so it is deployment config rather
     * than something the shared contract could encode — and plural, because a
     * jurisdiction can accept more than one shape (a sole trader's ten digits
     * and a company's twelve, a domestic number and a VAT number).
     *
     * One format means the field looks exactly as it always has. Several means
     * it leads with a picker, and the chosen format decides the prefix, the
     * mask and the rule. The full shape, and the checks that keep a format's
     * prefix/mask/example honest about its own pattern, are in
     * `companyIdInputSchema` — shared, because the API re-applies the same
     * rule.
     */
    companyIdInput: companyIdInputSchema.optional(),
    /**
     * Delivery zones and their free-delivery thresholds (FR-CART-07). Advisory:
     * a threshold is quoted, never enforced, and no zone prices a delivery.
     * Optional — a deployment that quotes nothing simply configures no zones.
     */
    delivery: deliveryConfigSchema.optional(),
    /**
     * How order references read. Server-side in effect — the browser never
     * builds one — but the config file is validated whole, so the shape is
     * declared here as well.
     */
    orderReference: orderReferenceConfigSchema.optional(),
    /**
     * Where this deployment ships. Optional: with no `address` key the address
     * book still works — the picker then offers nothing to choose from, which
     * is why a deployment that takes orders configures it.
     */
    address: addressConfigSchema.optional(),
  })
  .strict();

export type DeploymentConfig = DeepReadonly<
  z.infer<typeof deploymentConfigSchema>
>;
