import { type ShopNotice } from '@b2b-catalog-platform/shared/platform';
import { loadApiDeploymentConfig } from '../config/deployment-config';
import { env } from '../env';
import { MailColors, mailColors } from './mail-colors';

/** What a rendered message needs to look like it came from this deployment. */
export interface MailBranding {
  /** The wordmark in the header, and the footer's signature. */
  readonly name: string;
  /** Header band colour, from the deployment theme. */
  readonly primaryColor: string;
  readonly colors: MailColors;
  /** Public origin, for links back into the shop. No trailing slash. */
  readonly shopUrl: string;
  /** The language the message is written in, which it declares. */
  readonly locale: string;
  /** The deployment's notice (FR-NAV-08), above every message's content. */
  readonly notice?: ShopNotice;
}

export const MAIL_BRANDING = 'MAIL_BRANDING';

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
    colors: mailColors(config.branding.theme),
    shopUrl: origin.replace(/\/+$/, ''),
    locale: config.locale,
    notice: config.notice,
  };
}
