// Namespace import, not `{ z }`: the named form defeats tree shaking and
// pulls zod's 63 locale files into the bundle (colinhacks/zod#6050).
import * as z from 'zod';
import type { DeepReadonly } from '../node/deep-readonly';
import { addressConfigSchema } from './address-config';
import { companyIdInputSchema, phoneInputSchema } from './contact-config';
import { consentConfigSchema } from './consent-config';
import { KEYBOARD_LAYOUTS } from './keyboard-layout';
import {
  deliveryConfigSchema,
  orderReferenceConfigSchema,
} from './order-config';
import { pagesConfigSchema } from './pages-config';
import { signInStepConfigSchema } from './sign-in-step-config';
import { taxConfigSchema } from './tax-config';

/** The steps of the grey ramp a deployment may replace (`theme.neutrals`):
 * Tailwind's, plus the one between 100 and 200 the category chip uses. */
export const NEUTRAL_STEPS = [
  '50',
  '100',
  '125',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  '950',
] as const;

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
 * One place the shop also exists (FR-NAV-07) — a social account, a messenger,
 * a marketplace listing. Configuration rather than editable content: where the
 * chrome links to is the deployment's decision.
 *
 * `icon` names a file in the assets mount, beside the logo and the fonts. It is
 * a file rather than geometry in this JSON, and it is painted as a mask rather
 * than drawn as an image, so a borrowed mark takes the site's own colours and a
 * row of them reads as one set.
 *
 * `label` is the words that stand in for the icon: what a screen reader
 * announces, and what is left to read if the mark never arrives.
 */
export const elsewhereLinkSchema = z
  .object({
    label: z.string().min(1),
    /** Absolute, and off this site by definition. */
    url: z.string().min(1),
    /** File name in the assets mount, e.g. "marktplatz.svg". */
    icon: z.string().min(1),
    /**
     * The mark's shape, as for the logo: a mask has no size of its own, so the
     * box is given one before the file arrives and the row does not shift
     * when it does. Left out, the mark is square.
     */
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
 * The deployment's public facts: `deployment.json`, read whole by the web and
 * the API alike. The web injects it into every document it serves, so
 * everything here is visible to any visitor — what only the API needs is
 * `api.json` (the API's `apiConfigSchema`).
 */
/** Whether `tag` is a language tag `Intl` accepts, in its canonical form —
 * "de-DE", not "de_DE" or "de-de", so a `lang` attribute reads it as written. */
function isLocale(tag: string): boolean {
  try {
    return Intl.getCanonicalLocales(tag)[0] === tag;
  } catch {
    return false;
  }
}

export const deploymentConfigSchema = z
  .object({
    /**
     * The one locale the deployment speaks, as a BCP 47 tag ("de-DE"): the
     * language its text is written in, which a page and a mail declare, and
     * the conventions every date, number and amount is formatted by. One
     * setting, so a month name never comes out in another language than the
     * sentence around it. Required, so formatting is deterministic under SSR.
     */
    locale: z.string().refine(isLocale, {
      message: 'not a BCP 47 language tag, such as "de-DE"',
    }),
    branding: z
      .object({
        name: z.string(),
        /**
         * What the shop is, in a line: the landing page's heading, and with
         * the name the document `<title>` of every page that has none of its
         * own (`{name} — {tagline}`). Set at runtime, so SSR emits it and
         * crawlers see it.
         */
        tagline: z.string().min(1),
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
            /**
             * The weight a price is set in (`--font-weight-emphasis`). How
             * heavy "heavy" reads is a property of the face, which is why it
             * lives with the face and not with the colours: 700 is a step up
             * from the body text in the system stack and a shout in a family
             * whose medium and semibold are barely apart. Omitted, the
             * stylesheet's own figure stands.
             */
            emphasisWeight: z.number().int().min(100).max(900).optional(),
            /**
             * The same face for the PDFs the API draws (FR-ORD-05). Named
             * separately, and as `ttf`/`otf` files beside the `woff2` ones,
             * because a PDF embeds TrueType or CFF: a `woff2` embedded through
             * fontkit is tagged as TrueType and then refused by some readers
             * while rendering fine in others. Omitted, the API prints in the
             * face it ships with.
             */
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
        /**
         * Semantic color tokens. The three brand colors are required; the
         * neutrals default to the stone ramp in styles.css and are only worth
         * setting for a deployment whose palette is not warm-gray.
         */
        theme: z
          .object({
            primary: z.string(),
            primaryDeep: z.string(),
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
            /**
             * The grey ramp behind the tokens above: interaction backgrounds,
             * placeholders and disabled states, which the app draws in
             * Tailwind's `stone-*` shades directly. Stone is warm; a cool
             * palette replaces it here, step by step. A step left out keeps
             * stone's own.
             */
            neutrals: z
              .partialRecord(z.enum(NEUTRAL_STEPS), z.string())
              .optional(),
          })
          .strict(),
      })
      .strict(),
    /** Which static pages this deployment has, and where they are linked. */
    pages: pagesConfigSchema,
    /**
     * Which consents the forms ask for (NFR-LEGAL-09). A purpose switched on
     * draws its box, and its text is read under its form.
     */
    consent: consentConfigSchema,
    /** The tax basis prices are quoted on (NFR-LEGAL-11), stated under every
     * total and on the conditions page. */
    tax: taxConfigSchema,
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
     * currency. How an amount is written is `locale`'s.
     */
    catalog: z
      .object({
        currency: z
          .object({
            /** ISO 4217 code, e.g. "EUR". Drives symbol and fraction digits. */
            code: z.string(),
          })
          .strict(),
        /**
         * Whether a cart that is missing what its products are sold with may
         * be checked out (FR-SET-04). Advisory by default: the cart says what
         * is short and the customer decides, because a manager reads every
         * order and a hard block costs a support call. A deployment that
         * disagrees sets this, and the API refuses the order as well — a rule
         * enforced only in the browser is not a rule.
         */
        pairingsEnforced: z.boolean(),
        /**
         * Where "few left" sits for a product with neither a box nor a pack to
         * measure it in (FR-STOCK-02). The API applies the same figure; the
         * browser needs it only to tell an admin what threshold a product will
         * actually resolve to.
         */
        lowStockThresholdPieces: z.number().int().positive().optional(),
        /**
         * Whether the storefront draws the sort controls (FR-SEARCH-04).
         *
         * Off, a listing keeps its default order — relevance for a search,
         * name for a category — and the `sort` parameter keeps working, so a
         * link somebody saved still opens the listing they saved. It hides a
         * control, it does not remove an ordering: a shop whose customers know
         * the catalogue by heart reads a listing faster without one, and the
         * admin grid's own sorting is untouched.
         */
        sortControlsEnabled: z.boolean(),
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
     * Search (FR-SEARCH-08). `alternateLayout` names the keyboard layout a
     * query is also read on, for visitors who type with the wrong one active;
     * absent, a query is read only as typed.
     */
    search: z
      .object({ alternateLayout: z.enum(KEYBOARD_LAYOUTS).optional() })
      .strict()
      .optional(),
    /**
     * Offices shown on the contact page.
     */
    locations: z.array(contactLocationSchema),
    /**
     * Who serves the map embeds, by name ("OpenStreetMap"), for the texts that
     * tell a visitor where a map comes from: `{provider}` in the notice in
     * place of a withheld map and in the cookie banner. One name for the
     * deployment rather than one per map, as those texts name one.
     */
    mapProvider: z.string().min(1),
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
     * Where else the shop can be found (FR-NAV-07), in the order the footer
     * draws them. Optional, and an empty list is the same thing: a deployment
     * that is only here shows nothing beside the enquiry button.
     */
    elsewhere: z.array(elsewhereLinkSchema).optional(),
    /**
     * Who sells, named in every page's footer (NFR-LEGAL-02) for a
     * jurisdiction that wants the seller identifiable on the site itself.
     * `registration` holds whole strings, label included ("HRB 123456",
     * "VAT ID DE…"), because which numbers a seller quotes, and what they are
     * called, is the jurisdiction's. The way to reach the seller is the
     * header's `contact` unless the line has a `contact` of its own — which is
     * then the whole of it, so `{}` shows neither. Absent means no line.
     */
    seller: z
      .object({
        name: z.string().min(1),
        registration: z.array(z.string().min(1)).min(1),
        contact: z
          .object({
            phone: z.string().optional(),
            email: z.string().optional(),
          })
          .strict()
          .optional(),
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
    /** The second sign-in step (FR-AUTH-12): applied by the API, and shown
     * on an account's admin page. */
    signInStep: signInStepConfigSchema.optional(),
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
     * How order references read, and the shop's time zone, which dates are
     * given in on both sides.
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
