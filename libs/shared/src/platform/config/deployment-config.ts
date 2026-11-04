import * as z from 'zod';
import type { DeepReadonly } from '../deep-readonly';
import { addressConfigSchema } from '../../core/accounts/address-config';
import { companyIdInputSchema, phoneInputSchema } from '../contact-config';
import { consentConfigSchema } from '../../core/site/consent-config';
import { KEYBOARD_LAYOUTS } from '../keyboard-layout';
import {
  deliveryConfigSchema,
  orderReferenceConfigSchema,
} from '../../core/ordering/order-config';
import { pagesConfigSchema } from '../../core/site/pages-config';
import { signInStepConfigSchema } from '../../core/accounts/sign-in-step-config';
import { taxConfigSchema } from '../tax-config';
import { themeConfigSchema } from '../theme-config';
import { CUSTOMER_TYPES } from '../../core/accounts/users';

const mapEmbedSchema = z
  .object({
    /** An iframe src, deployment-owned and so bound as a resource URL. */
    url: z.string(),
    /** The embed sets cookies, so it waits for consent. */
    consentRequired: z.boolean().optional(),
  })
  .strict();

export type MapEmbed = DeepReadonly<z.infer<typeof mapEmbedSchema>>;

/** An office on the contact page; where goods are collected is `pickup`. */
const contactLocationSchema = z
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
 * Where an order may be collected (FR-CART-07): a list apart from the offices,
 * as neither is a subset of the other. An order snapshots `key`, name and
 * address, so a renamed or removed point leaves past orders readable.
 */
const pickupLocationSchema = z
  .object({
    key: z.string().min(1).max(64),
    name: z.string(),
    /** Required: an order that cannot say where it is collected is stuck. */
    address: z.string().min(1),
    /** Opening hours, which gate: what name and address do not say. */
    description: z.string().optional(),
    /** A link to open, not an embed: looked up in passing. */
    mapUrl: z.string().optional(),
  })
  .strict();

export type PickupLocation = DeepReadonly<z.infer<typeof pickupLocationSchema>>;

const pickupConfigSchema = z
  .object({
    locations: z
      .array(pickupLocationSchema)
      .min(1)
      .superRefine((locations, ctx) => {
        const seen = new Set<string>();
        locations.forEach((location, index) => {
          if (seen.has(location.key)) {
            ctx.addIssue({
              code: 'custom',
              path: [index, 'key'],
              // An order naming a duplicate would snapshot whichever came first.
              message: `pickup location ${location.key} is listed twice`,
            });
          }
          seen.add(location.key);
        });
      }),
  })
  .strict();

/**
 * Where else the shop exists (FR-NAV-07): a social account, a marketplace.
 * `icon` is a file in the assets mount, painted as a mask so every mark takes
 * the site's colours; `label` is what a screen reader announces instead.
 */
const elsewhereLinkSchema = z
  .object({
    label: z.string().min(1),
    url: z.string().min(1),
    /** File name in the assets mount, e.g. "marktplatz.svg". */
    icon: z.string().min(1),
    /** A mask has no size of its own, so the box is sized before the file
     * arrives. Left out, the mark is square. */
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    (link) => (link.width === undefined) === (link.height === undefined),
    {
      message: 'width and height go together',
    },
  );

export type ElsewhereLink = DeepReadonly<z.infer<typeof elsewhereLinkSchema>>;

/**
 * A line above every page and mail (FR-NAV-08), such as a holiday closure.
 * Config, not text: most deployments have none, and a text has no optional
 * keys. `link` is absolute, as a mail has no page to resolve against.
 */
const siteNoticeSchema = z
  .object({
    text: z.string().min(1),
    link: z
      .object({
        label: z.string().min(1),
        url: z.url({ protocol: /^https?$/ }),
      })
      .strict()
      .optional(),
  })
  .strict();

export type SiteNotice = DeepReadonly<z.infer<typeof siteNoticeSchema>>;

/** Whether `tag` is a language tag `Intl` accepts, in its canonical form:
 * "de-DE", not "de_DE" or "de-de", so a `lang` attribute reads it as written. */
function isLocale(tag: string): boolean {
  try {
    return Intl.getCanonicalLocales(tag)[0] === tag;
  } catch {
    return false;
  }
}

/** How the header, footer or seller line reaches the shop; a field left out
 * is not drawn. */
const contactLinesSchema = z
  .object({
    phone: z.string().optional(),
    email: z.string().optional(),
  })
  .strict();

/**
 * The deployment's public facts in `deployment.json`, read by the web and the
 * API. Injected into every page, so a visitor can read all of it; what only the
 * API needs is `api.json`.
 */
export const deploymentConfigSchema = z
  .object({
    /**
     * The one locale (BCP 47): the text's language and the conventions of
     * every date, number and amount, so a month name never comes out in
     * another language than its sentence. Required for deterministic SSR.
     */
    locale: z.string().refine(isLocale, {
      message: 'not a BCP 47 language tag, such as "de-DE"',
    }),
    branding: z
      .object({
        name: z.string(),
        /** The landing heading, and the `<title>` of a page without its own
         * (`{name} — {tagline}`). */
        tagline: z.string().min(1),
        /** The copyright range's first year; it runs to the current one. */
        startYear: z.number().int(),
        /** The intrinsic size of `assets/logo.svg`, not a display size: it
         * reserves the box, so the search field does not shift on load. */
        logo: z
          .object({
            width: z.number().int().positive(),
            height: z.number().int().positive(),
          })
          .strict(),
        /**
         * `family` is a CSS font-family list; left out, the system stack.
         * `stylesheet` is a file in the assets mount with the @font-face
         * rules, self-hosted so no visitor is announced to a font CDN.
         */
        font: z
          .object({
            family: z.string().min(1),
            stylesheet: z.string().min(1).optional(),
            /** The weight a price is set in (`--font-weight-emphasis`): how
             * heavy reads depends on the face. */
            emphasisWeight: z.number().int().min(100).max(900).optional(),
            /** The face for the API's PDFs (FR-ORD-05), as ttf/otf: a woff2
             * embedded through fontkit is refused by some readers. Left out,
             * the API's own face. */
            pdf: z
              .object({
                regular: z.string().min(1),
                bold: z.string().min(1),
              })
              .strict()
              .optional(),
          })
          .strict()
          .optional(),
        /** The colours, as the roles in the UI library's ui.css. */
        theme: themeConfigSchema,
      })
      .strict(),
    /** Which static pages this deployment has, and where they are linked. */
    pages: pagesConfigSchema,
    /** Which consents the forms ask for (NFR-LEGAL-09). */
    consent: consentConfigSchema,
    tax: taxConfigSchema,
    /** Off: no banner, and non-essential storage loads ungated, for a
     * jurisdiction without consent requirements. */
    cookieConsentEnabled: z.boolean(),
    /** Off: an order is invoiced to its delivery address, or none for a
     * pickup, so checkout asks for no invoice address at all. */
    billingAddressEnabled: z.boolean(),
    catalog: z
      .object({
        /** Prices are integer minor units; this names their one currency. */
        currency: z
          .object({
            /** ISO 4217, e.g. "EUR". */
            code: z.string(),
          })
          .strict(),
        /** Whether a cart missing what its products are sold with may still be
         * ordered (FR-SET-04). Advisory by default; set, the API refuses too. */
        pairingsEnforced: z.boolean(),
        /** "Few left" for a product with neither box nor pack (FR-STOCK-02);
         * the admin reads it to show the threshold a product resolves to. */
        lowStockThresholdPieces: z.number().int().positive().optional(),
        /** Whether listings draw sort controls (FR-SEARCH-04). Off, `sort`
         * still works, so a saved link opens what was saved. */
        sortControlsEnabled: z.boolean(),
        /** Labels only: the numbers are stored as entered. */
        boxUnits: z
          .object({
            volume: z.string(),
            weight: z.string(),
          })
          .strict(),
      })
      .strict(),
    /** The keyboard layout a query is also read on, for a visitor typing with
     * the wrong one active (FR-SEARCH-08). */
    search: z
      .object({ alternateLayout: z.enum(KEYBOARD_LAYOUTS).optional() })
      .strict()
      .optional(),
    locations: z.array(contactLocationSchema),
    /** Who serves the maps ("OpenStreetMap"), as `{provider}` in the
     * withheld-map notice and the cookie banner. */
    mapProvider: z.string().min(1),
    /** Absent, not empty, where the shop offers no pickup. */
    pickup: pickupConfigSchema.optional(),
    /** Shown in the header bar and footer. */
    contact: contactLinesSchema.optional(),
    /** In the order the footer draws them. */
    elsewhere: z.array(elsewhereLinkSchema).optional(),
    notice: siteNoticeSchema.optional(),
    /**
     * The seller in every footer (NFR-LEGAL-02). `registration` holds whole
     * strings ("HRB 123456"), as which numbers to quote is the jurisdiction's.
     * Its own `contact` replaces the header's, so `{}` shows neither.
     */
    seller: z
      .object({
        name: z.string().min(1),
        registration: z.array(z.string().min(1)).min(1),
        contact: contactLinesSchema.optional(),
      })
      .strict()
      .optional(),
    /** The country code is fixed and shown beside the field; the mask
     * groups the national part as it is typed. */
    phoneInput: phoneInputSchema.optional(),
    /** The second sign-in step (FR-AUTH-12). */
    signInStep: signInStepConfigSchema.optional(),
    /** The registration number a company gives (FR-AUTH-01): one format
     * or several, then with a picker. The API applies the same rule. */
    companyIdInput: companyIdInputSchema.optional(),
    /**
     * The customers the shop sells to (FR-AUTH-13), listed so every deployment
     * says it. A kind left out is offered nowhere and refused wherever an
     * account or order is written. A sole trader with a number is a company.
     */
    customerTypes: z
      .array(z.enum(CUSTOMER_TYPES))
      .min(1)
      .refine((types) => new Set(types).size === types.length, {
        message: 'a customer type is listed twice',
      }),
    /** Delivery zones and their free-delivery thresholds (FR-CART-07):
     * quoted, never enforced, and no zone prices a delivery. */
    delivery: deliveryConfigSchema.optional(),
    /** How references read, and the shop's time zone for dates. */
    orderReference: orderReferenceConfigSchema.optional(),
    /** Where the shop ships. Without it, the picker offers nothing. */
    address: addressConfigSchema.optional(),
  })
  .strict();

export type DeploymentConfig = DeepReadonly<
  z.infer<typeof deploymentConfigSchema>
>;
