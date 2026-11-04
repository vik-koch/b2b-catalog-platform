import * as z from 'zod';
import type { DeepReadonly } from '../../platform/deep-readonly';
import { consentConfigSchema } from './consent-config';
import { pagesConfigSchema } from './pages-config';

const mapEmbedSchema = z
  .object({
    /** Bound as a resource URL: the deployment owns it. */
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

/** Where else the shop exists (FR-NAV-07): a social account, a marketplace. */
const elsewhereLinkSchema = z
  .object({
    label: z.string().min(1),
    url: z.string().min(1),
    /** A file in the assets mount, painted as a mask so every mark takes the
     * theme's colours; `label` is what a screen reader hears instead. */
    icon: z.string().min(1),
    /** A mask has no size of its own, so the box is sized before the file
     * arrives. Left out, the mark is square. */
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    (link) => (link.width === undefined) === (link.height === undefined),
    { message: 'width and height go together' },
  );

export type ElsewhereLink = DeepReadonly<z.infer<typeof elsewhereLinkSchema>>;

/** The site's block of `deployment.json`. */
export const siteConfigShape = {
  pages: pagesConfigSchema,
  consent: consentConfigSchema,
  /** Off: no banner, and non-essential storage loads ungated, for a
   * jurisdiction that requires no consent. */
  cookieConsentEnabled: z.boolean(),
  locations: z.array(contactLocationSchema),
  /** Who serves the maps, as `{provider}` in the cookie banner and in place
   * of a withheld map. */
  mapProvider: z.string().min(1),
  /** In the order the footer draws them. */
  elsewhere: z.array(elsewhereLinkSchema).optional(),
};

export type SiteConfig = DeepReadonly<
  z.infer<z.ZodObject<typeof siteConfigShape>>
>;
