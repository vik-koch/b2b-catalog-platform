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
    linkExpiry: 'This link works once and expires after seven days.',
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
  accountApproved: {
    subject: 'Your account is ready',
    preheader: 'Choose a password to start ordering.',
    heading: 'Your account is ready',
    body: 'Your registration has been approved. Choose a password to finish setting up your account.',
    action: 'Choose your password',
  },
  accountCreated: {
    subject: 'An account has been created for you',
    preheader: 'Choose a password to start ordering.',
    heading: 'An account has been created for you',
    body: 'We have set up a customer account for you. Choose a password to start using it.',
    action: 'Choose your password',
  },
  accountReactivated: {
    subject: 'Your account is active again',
    preheader: 'Choose a new password to start ordering again.',
    heading: 'Your account is active again',
    body: 'Your account has been switched back on. The old password no longer works — choose a new one.',
    action: 'Choose your password',
  },
  newRegistration: {
    subject: 'New registration',
    preheader: 'Someone requested a customer account.',
    heading: 'New registration',
    body: 'Someone has requested a customer account.',
    nameLabel: 'Name',
    emailLabel: 'Email',
    phoneLabel: 'Phone',
    customerTypeLabel: 'Registering as',
    customerTypePerson: 'Private person',
    customerTypeCompany: 'Company',
    companyIdLabel: 'Company registration number',
    action: 'Open the account list',
  },
};

/** Demo branding for tests, mirroring config/deployment.json. */
export const demoMailBranding: MailBranding = {
  name: 'Coffee Kontor',
  primaryColor: '#6f4e37',
  siteUrl: 'https://shop.example',
};
