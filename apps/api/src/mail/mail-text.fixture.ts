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
  registrationReceived: {
    subject: 'We received your registration',
    preheader: 'Your registration is with our team.',
    heading: 'Thank you for registering',
    body: 'We have received your registration and passed it to our team.',
    nextSteps:
      'A colleague will review it and set up your account. You will receive a second email with your password as soon as it is ready.',
  },
  newRegistration: {
    subject: 'New registration',
    preheader: 'Someone requested a customer account.',
    heading: 'New registration',
    body: 'Someone has requested a customer account.',
    emailLabel: 'Email',
    action: 'Open the account list',
  },
};

/** Demo branding for tests, mirroring config/deployment.json. */
export const demoMailBranding: MailBranding = {
  name: 'Coffee Kontor',
  primaryColor: '#6f4e37',
  siteUrl: 'https://shop.example',
};
