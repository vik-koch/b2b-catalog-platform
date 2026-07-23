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
 * Delivered to the browser via TransferState (see deployment-config.server.ts)
 * — no separate public config endpoint, no runtime fetch. Non-secret by
 * construction: the browser needs them to render.
 */
export const deploymentConfigSchema = z
  .object({
    branding: z
      .object({
        name: z.string(),
        logo: z.string(),
        /**
         * Document `<title>` for the whole site, set at runtime by the root
         * component via the Angular Title service (so SSR emits it and crawlers
         * see it).
         */
        title: z.string(),
      })
      .strict(),
    /**
     * Whether cookie-consent gating is enforced. When false, no banner is shown
     * and non-essential storage is not gated — correct both while the app sets
     * only strictly-necessary storage, and for deployments in jurisdictions
     * without consent requirements (optional storage just loads).
     */
    cookieConsentEnabled: z.boolean(),
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
