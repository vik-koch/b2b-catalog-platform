import { MailBranding } from './mail-branding';
import { MailText } from './mail-text';

/**
 * Complete, schema-shaped demo mail wording for tests only. Never imported by
 * production code, so no demo wording is baked into the image. Mirrors
 * config/mail-text.json.
 */
export const demoMailText: MailText = {
  common: {
    footerNote: 'This message was sent automatically. Please do not reply.',
  },
  inquiry: {
    subject: 'Inquiry',
    preheader: 'A visitor sent an inquiry through the contact form.',
    heading: 'New inquiry',
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    preferredContact: 'Preferred contact',
    message: 'Message',
  },
};

/** Demo branding for tests, mirroring config/deployment.json. */
export const demoMailBranding: MailBranding = {
  name: 'Coffee Kontor',
  primaryColor: '#6f4e37',
  siteUrl: 'https://shop.example',
};
