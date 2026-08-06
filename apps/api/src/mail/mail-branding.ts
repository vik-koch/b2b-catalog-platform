import { DeepReadonly, loadConfig } from '@b2b-catalog-platform/shared/node';
import { z } from 'zod';
import { env } from '../env';

/**
 * The slice of the deployment config the mail layout needs: who the message is
 * from, and in what colour. The web app validates that same file whole (see
 * apps/web config/deployment-config.type.ts); this schema is deliberately
 * narrow and non-strict at the top level, because the API neither knows nor
 * cares about the chrome, pages and map keys living beside `branding`.
 */
export const mailBrandingSchema = z.object({
  branding: z
    .object({
      name: z.string(),
      theme: z.object({ primary: z.string() }),
    })
    // Non-strict for the same reason: `title`, `startYear` and the rest belong
    // to the web app, and a key added there must not fail the API's boot.
    .passthrough(),
});

/** What a rendered message needs to look like it came from this deployment. */
export interface MailBranding {
  /** The shop's name — the wordmark in the header and the footer signature. */
  readonly name: string;
  /** Header band colour, from the deployment theme. */
  readonly primaryColor: string;
  /** Public origin, for links back into the shop. No trailing slash. */
  readonly siteUrl: string;
}

export const MAIL_BRANDING = 'MAIL_BRANDING';

/**
 * Read once at boot, from the same mounted deployment config the web app uses,
 * plus APP_ORIGIN for the links (mail is read outside the browser, so every URL
 * in it has to be absolute).
 */
export function loadMailBranding(): MailBranding {
  const config: DeepReadonly<z.infer<typeof mailBrandingSchema>> = loadConfig(
    mailBrandingSchema,
    'DEPLOYMENT_CONFIG_FILE',
  );
  const origin = env.APP_ORIGIN;
  if (!origin) {
    // env.ts requires this in server mode; this narrows the optional type.
    throw new Error('APP_ORIGIN is not configured');
  }
  return {
    name: config.branding.name,
    primaryColor: config.branding.theme.primary,
    siteUrl: origin.replace(/\/+$/, ''),
  };
}
