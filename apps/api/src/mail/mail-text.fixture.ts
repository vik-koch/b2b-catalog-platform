import {
  SharedText,
  sharedTextSchema,
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
  'deployments/fixture/config/texts/mail.json',
);

export const demoSharedText: SharedText = loadConfigFile(
  sharedTextSchema,
  'deployments/fixture/config/texts/shared.json',
);
export const demoPdfText: PdfText = loadConfigFile(
  pdfTextSchema,
  'deployments/fixture/config/texts/pdf.json',
);

/** Demo branding for tests, mirroring the fixture's deployment.json. */
export const demoMailBranding: MailBranding = {
  name: 'Coffee Kontor',
  primaryColor: '#6f4e37',
  siteUrl: 'https://shop.example',
  locale: 'de-DE',
};

/** The demo phone grouping, for the mails that quote a number back at staff. */
export const demoPhoneInput: PhoneConfig = {
  countryCode: '+49',
  mask: '(###) ###-####',
};
