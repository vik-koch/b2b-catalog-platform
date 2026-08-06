import { loadApiDeploymentConfig } from '../config/deployment-config';
import { env } from '../env';

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
  const config = loadApiDeploymentConfig();
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
