import { PhoneConfig } from '@b2b-catalog-platform/shared';
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
    units: { piece: 'pcs', pack: 'pk', box: 'bx' },
    quantity: '{qty} {unit}',
    quantityPieces: '{qty} {unit} ({pieces} {pieceUnit})',
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
  passwordReset: {
    subject: 'Reset your password',
    preheader: 'Choose a new password for your account.',
    heading: 'Reset your password',
    body: 'Someone asked to reset the password for your account.',
    expiry:
      'This link can be used once, and expires an hour after it was sent.',
    ignore: 'If this was not you, you can ignore this message.',
    action: 'Choose a new password',
  },
  accountDeleted: {
    subject: 'Your account has been deleted',
    preheader: 'Your account and personal details have been removed.',
    heading: 'Your account has been deleted',
    body: 'Your account is closed and your personal details have been removed.',
    orders:
      'Past orders are kept for bookkeeping, with your details removed. Registering again starts a new account.',
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
    companyNameLabel: 'Company name',
    companyIdLabel: 'Company ID',
    action: 'Open the account list',
  },
  orderReceived: {
    subject: 'We have your order request',
    preheader: 'Your order request has reached us.',
    heading: 'Thank you — we have your order',
    body: 'Your order request {reference} has reached us.',
    nextSteps:
      'We will confirm the details, the delivery and the price with you shortly.',
    referenceLabel: 'Order',
    itemsHeading: 'Your items',
    totalLabel: 'Total',
    fulfilmentLabel: 'How it arrives',
    delivery: 'Delivery',
    pickup: 'Self-pickup',
    action: 'Open your order',
  },
  newOrder: {
    subject: 'New order request',
    preheader: 'A customer has sent an order request.',
    heading: 'New order request',
    body: 'A customer has sent an order request.',
    referenceLabel: 'Order',
    customerLabel: 'Account',
    guest: 'Guest — no account',
    contactLabel: 'Contact',
    partyLabel: 'Invoice to',
    fulfilmentLabel: 'How it arrives',
    delivery: 'Delivery',
    pickup: 'Self-pickup',
    paymentLabel: 'Payment',
    cash: 'Cash',
    transfer: 'Bank transfer',
    card: 'Card, arranged with the customer',
    itemsHeading: 'Ordered',
    totalLabel: 'Total',
    action: 'Open the order',
  },
  orderCancelled: {
    subject: 'Order called off',
    preheader: 'A customer has called off their order.',
    heading: 'Order called off',
    body: 'A customer has called off an order that was waiting for an answer.',
    referenceLabel: 'Order',
    customerLabel: 'Account',
    guest: 'Guest — no account',
    contactLabel: 'Contact',
    reasonLabel: 'Reason given',
    reasonNone: 'None given',
    totalLabel: 'Total',
    paidNote:
      'A payment is recorded against this order. Any refund is arranged with the customer directly.',
    itemsHeading: 'Was ordered',
    action: 'Open the order',
  },
  accountClosed: {
    subject: 'An account was closed',
    preheader: 'A customer has closed their account.',
    heading: 'Account closed',
    body: 'A customer has closed their account. Their details are gone; their orders were kept and anonymized.',
    nameLabel: 'Was',
    emailLabel: 'Email',
    ordersLabel: 'Orders kept',
    openOrdersNote:
      '{count} of them have not ended yet, and can no longer be traced back to a customer.',
    action: 'Open the order list',
  },
  orderStatusChanged: {
    subject: 'Your order',
    preheader: 'There is news about your order.',
    referenceLabel: 'Order',
    totalLabel: 'Total',
    reasonLabel: 'Reason',
    changedLabel: 'What changed',
    changedIntro:
      'We have changed this order since we last wrote to you — what we changed is noted below, and the contents and total are the ones that now apply.',
    correctedIntro:
      'We have corrected our record of this order: it had moved further along than it should have. Where it now stands is below.',
    attachedNote:
      'Our payment details for this order are attached to this message.',
    deliveryLabel: 'Delivery address',
    pickupLabel: 'Collect from',
    itemsHeading: 'Your items',
    action: 'Open your order',
    statuses: {
      changed: {
        heading: 'We have changed your order',
        body: 'Where your order stands has not changed — its contents and total have. The ones below are the ones that now apply.',
      },
      reopened: {
        heading: 'Your order is back with us',
        body: 'We have put your order back in our queue and will come back to you about it shortly. Anything we told you about it before no longer applies.',
      },
      approved: {
        heading: 'Your order is confirmed',
        body: 'We have confirmed your order. We will let you know as soon as it is ready.',
      },
      readyDelivery: {
        heading: 'Your order is on its way',
        body: 'Your order has left us for delivery to the address below.',
      },
      readyPickup: {
        heading: 'Your order is ready to collect',
        body: 'Your order is packed and waiting at the pickup location below. Please bring your order number.',
      },
      completed: {
        heading: 'Your order is complete',
        body: 'Your order is finished. Thank you — we look forward to the next one.',
      },
      declined: {
        heading: 'We cannot fill this order',
        body: 'We are sorry: we are unable to fill this order. The reason is below, and you are welcome to call us about it.',
      },
      cancelled: {
        heading: 'Your order has been cancelled',
        body: 'This order has been cancelled and will not be filled. The reason is below, and you are welcome to call us about it.',
      },
    },
  },
  orderDocument: {
    subject: 'A document for your order',
    preheader: 'There is a document with your order.',
    referenceLabel: 'Order',
    totalLabel: 'Total',
    action: 'Open your order',
    kinds: {
      paymentInstructions: {
        heading: 'How to pay for your order',
        body: 'Our payment details for this order are attached. Nothing about the order itself has changed.',
      },
      orderSummary: {
        heading: 'A copy of your order',
        body: 'We have put a copy of your order with it, which you can open from the link below. Nothing about the order itself has changed.',
      },
    },
  },
  orderSummaryPdf: {
    title: 'Order {reference}',
    placedLabel: 'Placed',
    statusLabel: 'Status',
    paymentLabel: 'Payment',
    invoiceLabel: 'Invoiced to',
    deliveryLabel: 'Delivery address',
    pickupLabel: 'Collect from',
    whenLabel: 'Preferred date',
    whenAny: 'No date given',
    contactLabel: 'Contact',
    noteLabel: 'Your note',
    changesLabel: 'What we changed',
    itemsLabel: 'Item',
    quantityLabel: 'Quantity',
    lineTotalLabel: 'Total',
    totalLabel: 'Order total',
    footer:
      'This document states the order as it stands. It is not an invoice.',
    statuses: {
      requested: 'Requested',
      approved: 'Confirmed',
      ready: 'Ready',
      completed: 'Completed',
      declined: 'Declined',
      cancelled: 'Cancelled',
    },
    payments: {
      cash: 'Cash',
      bankTransfer: 'Bank transfer',
      cardLater: 'Card, arranged with us',
    },
    paymentStates: {
      notDue: 'Nothing due yet',
      awaiting: 'Awaiting payment',
      paid: 'Paid',
    },
  },
  syncRun: {
    startedLabel: 'Started',
    labelLabel: 'Export',
    sourceLabel: 'Source',
    changesLabel: 'Changes',
    errorLabel: 'What went wrong',
    reasonLabel: 'Why it is waiting',
    reasons: {
      policy: 'Its effect is larger than an automatic update is allowed to be',
      requested: 'The source asked for it to be reviewed',
    },
    kinds: {
      failed: {
        subject: 'Catalog update failed',
        preheader: 'An automatic catalog update did not go through.',
        heading: 'An automatic catalog update failed',
        body: 'Your catalog is unchanged and the shop is serving what it served before.',
        action: 'Open the run',
      },
      recovered: {
        subject: 'Catalog updates are working again',
        preheader: 'The automatic catalog update went through.',
        heading: 'Catalog updates are working again',
        body: 'The connection to your system is delivering again.',
        action: 'Open the run',
      },
      waiting: {
        subject: 'A catalog update is waiting for you',
        preheader: 'An automatic catalog update needs your decision.',
        heading: 'A catalog update is waiting for you',
        body: 'It has not been applied. Apply it or discard it.',
        action: 'Review the update',
      },
      created: {
        subject: 'New products from your system',
        preheader: 'An automatic catalog update brought new products.',
        heading: 'New products arrived',
        body: 'They are in your catalog but not on the shop.',
        action: 'Open the new products',
      },
    },
  },
};

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
