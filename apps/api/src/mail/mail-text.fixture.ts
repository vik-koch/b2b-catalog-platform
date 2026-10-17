import {
  CommonText,
  commonTextSchema,
  PhoneConfig,
} from '@b2b-catalog-platform/shared';
import { loadConfigFile } from '@b2b-catalog-platform/shared/node';
import { MailBranding } from './mail-branding';
import { MailText, mailTextSchema } from './mail-text';
import { PdfText, pdfTextSchema } from '../pdf/pdf-text';

/**
 * The demo wording for tests and the generated docs, read from the committed
 * config files so it cannot drift from what the demo deployment sends. By path,
 * not env var: the doc generators run without one.
 */
export const demoMailText: MailText = loadConfigFile(
  mailTextSchema,
  'config/mail-text.json',
);

export const demoCommonText: CommonText = loadConfigFile(
  commonTextSchema,
  'config/common-text.json',
);
export const demoPdfText: PdfText = loadConfigFile(
  pdfTextSchema,
  'config/pdf-text.json',
);

/** Demo branding for tests, mirroring config/deployment.json. */
export const demoMailBranding: MailBranding = {
  name: 'Coffee Kontor',
  primaryColor: '#6f4e37',
  siteUrl: 'https://shop.example',
};

/** The demo phone grouping, for the mails that quote a number back at staff. */
export const demoPhoneInput: PhoneConfig = {
  countryCode: '+49',
  mask: '(###) ###-####',
};
