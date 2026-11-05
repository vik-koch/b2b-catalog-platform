import * as z from 'zod';
import type { DeepReadonly } from '../deep-readonly';
import { ACCOUNTS_AREA } from '../../core/accounts/accounts-area';
import { accountsConfigShape } from '../../core/accounts/accounts-config';
import { CATALOG_AREA } from '../../core/catalog/catalog-area';
import { catalogConfigShape } from '../../core/catalog/catalog-config';
import { orderingConfigShape } from '../../core/ordering/order-config';
import { siteConfigShape } from '../../core/site/site-config';
import { companyIdInputSchema, phoneInputSchema } from '../contact-config';
import { KEYBOARD_LAYOUTS } from '../keyboard-layout';
import { mergeShapes } from '../merge-shapes';
import { taxConfigSchema } from '../tax-config';
import { themeConfigSchema } from '../theme-config';
import { SITE_AREA } from '../../core/site/site-area';

/**
 * A line above every page and mail (FR-NAV-08), such as a holiday closure.
 * Config, not text: most deployments have none, and a text has no optional
 * keys. `link` is absolute, as a mail has no page to resolve against.
 */
const shopNoticeSchema = z
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

export type ShopNotice = DeepReadonly<z.infer<typeof shopNoticeSchema>>;

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

/** The platform's keys of `deployment.json`. */
const platformConfigShape = {
  /** The text's language and the conventions of every date, number and
   * amount, so a month name never comes out in another language than its
   * sentence. */
  locale: z.string().refine(isLocale, {
    message: 'not a BCP 47 language tag, such as "de-DE"',
  }),
  /** Prices are integer minor units; this names their one currency, as
   * ISO 4217 ("EUR"). */
  currency: z.object({ code: z.string() }).strict(),
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
      /** The roles of the UI library's ui.css. */
      theme: themeConfigSchema,
    })
    .strict(),
  tax: taxConfigSchema,
  /** The keyboard layout a query is also read on, for a visitor typing with
   * the wrong one active (FR-SEARCH-08). */
  search: z
    .object({ alternateLayout: z.enum(KEYBOARD_LAYOUTS).optional() })
    .strict()
    .optional(),
  /** Shown in the header bar and footer. */
  contact: contactLinesSchema.optional(),
  notice: shopNoticeSchema.optional(),
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
  /** The registration number a company gives (FR-AUTH-01): one format
   * or several, then with a picker. The API applies the same rule. */
  companyIdInput: companyIdInputSchema.optional(),
};

/**
 * The deployment's public facts, read by the web and the API. Injected into
 * every page, so a visitor can read all of it; what only the API needs is
 * `api.json`.
 */
export const deploymentConfigSchema = z
  .object(
    mergeShapes(
      platformConfigShape,
      { [SITE_AREA]: z.object(siteConfigShape).strict() },
      { [CATALOG_AREA]: z.object(catalogConfigShape).strict() },
      { [ACCOUNTS_AREA]: z.object(accountsConfigShape).strict() },
      orderingConfigShape,
    ),
  )
  .strict();

export type DeploymentConfig = DeepReadonly<
  z.infer<typeof deploymentConfigSchema>
>;
