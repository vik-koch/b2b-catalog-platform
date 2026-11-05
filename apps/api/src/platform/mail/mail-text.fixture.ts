import { loadConfigFile } from '@b2b-catalog-platform/shared/node';
import { MailBranding } from './mail-branding';
import { DEFAULT_MAIL_COLORS } from './mail-colors';
import * as z from 'zod';
import { MailText, mailTextShape } from './mail-text';
import { PdfText, pdfTextShape } from '../pdf/pdf-text';
import {
  PhoneConfig,
  SharedText,
  sharedTextSchema,
} from '@b2b-catalog-platform/shared/platform';

/**
 * The demo wording for tests and the generated docs, read from the committed
 * config files so it cannot drift from what the demo deployment sends. By path,
 * not env var: the doc generators run without one.
 */
export const demoMailText: MailText = loadConfigFile(
  z.looseObject(mailTextShape),
  'deployments/fixture/config/texts/mail.json',
);

export const demoSharedText: SharedText = loadConfigFile(
  sharedTextSchema,
  'deployments/fixture/config/texts/shared.json',
);
export const demoPdfText: PdfText = loadConfigFile(
  z.looseObject(pdfTextShape),
  'deployments/fixture/config/texts/pdf.json',
);

/** Demo branding for tests, mirroring the fixture's deployment.json. */
export const demoMailBranding: MailBranding = {
  name: 'Coffee Kontor',
  primaryColor: '#6f4e37',
  colors: DEFAULT_MAIL_COLORS,
  shopUrl: 'https://shop.example',
  locale: 'de-DE',
};

/** The demo phone grouping, for the mails that quote a number back at staff. */
export const demoPhoneInput: PhoneConfig = {
  countryCode: '+49',
  mask: '(###) ###-####',
};
