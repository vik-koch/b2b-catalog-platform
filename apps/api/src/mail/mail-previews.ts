import {
  MoneyFormat,
  OrderDetail,
  OrderPickup,
} from '@b2b-catalog-platform/shared';
import type { MailBranding } from './mail-branding';
import { MailContent, RenderedMail, renderMail } from './mail-layout';
import { demoMailText } from './mail-text.fixture';
import type { MailText } from './mail-text';
import { demoAdminOrder } from '../orders/order.fixture';
import { accountDeletedMail } from './templates/account-deleted.template';
import { inquiryMail } from './templates/inquiry.template';
import { invitationMail } from './templates/invitation.template';
import { newOrderMail } from './templates/new-order.template';
import { newRegistrationMail } from './templates/new-registration.template';
import { orderDocumentMail } from './templates/order-document.template';
import { orderReceivedMail } from './templates/order-received.template';
import { orderStatusChangedMail } from './templates/order-status.template';
import { passwordResetMail } from './templates/password-reset.template';
import { registrationReceivedMail } from './templates/registration-received.template';

/**
 * Every message the app can send, rendered from demo wording — the readable
 * record of what a customer actually receives.
 *
 * It exists because a template is a function nobody can read the output of.
 * Whether the shop's refusal quotes its reason, whether a guest gets a token
 * link and an account holder does not, whether a mail about a change lists the
 * changes: all of that is decided in code and answered nowhere a person can
 * look. So the previews are rendered to `docs/mail/` by
 * `tools/generate-mail-previews.mjs`, and a reworded template shows up as a
 * diff in the documentation rather than in nobody's inbox.
 *
 * Tests only, like `mail-text.fixture.ts`, and for the same reason: no demo
 * wording may be baked into the image. Nothing in `src/main.ts`'s import graph
 * reaches this file.
 *
 * The variants are chosen for what *differs*, not for coverage: a status mail
 * per status is worth reading because each says something else, a second
 * inquiry is not.
 */

const currency: MoneyFormat = { code: 'EUR', locale: 'de-DE' };

/**
 * Illustrative branding, not a deployment's. Reading `config/deployment.json`
 * here would make the committed previews change whenever the demo shop is
 * renamed, which says nothing about the mail.
 */
export const demoMailBranding: MailBranding = {
  name: 'Demo Shop',
  primaryColor: '#6f4e37',
  siteUrl: 'https://shop.example.com',
};

const pickupOffice: OrderPickup = {
  key: 'main',
  name: 'Speicherstadt Office',
  address: 'Am Sandtorkai 4, 20457 Hamburg',
};

const order = demoAdminOrder;
const pickupOrder: OrderDetail = {
  ...order,
  fulfilmentMethod: 'pickup',
  deliveryAddress: null,
  pickup: pickupOffice,
};
const declinedOrder: OrderDetail = {
  ...order,
  status: 'declined',
  statusReason: 'The espresso cups are out of stock until the end of October.',
};
const cancelledOrder: OrderDetail = {
  ...order,
  status: 'cancelled',
  statusReason: 'Cancelled on the phone at the customer’s request.',
};
const at = (status: OrderDetail['status']): OrderDetail => ({
  ...order,
  status,
});

/** The token a guest's link carries. Fixed, so the previews stay diffable. */
const TOKEN = 'demo-token';

/** What the shop said it changed, as an adjustment records it. */
const CHANGES = [
  'Only 12 of the espresso cups left — the rest follows next week.',
  'Delivery moved to Friday.',
];

/** Which part of the app a message belongs to, in reading order. */
export const MAIL_PREVIEW_GROUPS = [
  'Signing up and getting in',
  'The account itself',
  'Orders',
  'Getting in touch',
] as const;
export type MailPreviewGroup = (typeof MAIL_PREVIEW_GROUPS)[number];

export interface MailPreview {
  /** File name under `docs/mail/`, and the anchor the index links to. */
  readonly slug: string;
  readonly title: string;
  /** Which section of the index this message is listed under. */
  readonly group: MailPreviewGroup;
  /** When this message is sent, and what makes this variant different. */
  readonly note: string;
  /**
   * The reading an order journey produces when this message arrives
   * (`docs/order-lifecycle.md`), so the journey tables can link at the message
   * they are talking about. Only the canonical preview of a message carries
   * one — a second variant of the same mail is documentation, not a different
   * message.
   */
  readonly shows?: string;
  readonly content: MailContent;
}

/**
 * Every message, in whatever wording it is handed.
 *
 * A function rather than a constant so the same set can be rendered from the
 * demo fixture (the specs) or from a deployment's own mounted `mail-text.json`
 * (the generator) — which is what makes this gallery a way to proof-read a
 * translation without sending a single message.
 */
export function buildMailPreviews(text: MailText): readonly MailPreview[] {
  return [
    {
      slug: 'inquiry',
      group: 'Getting in touch',
      title: 'Inquiry (to the shop)',
      note: 'The contact form, delivered to the staff inbox with the visitor as Reply-To.',
      content: inquiryMail(
        {
          name: 'Jane Doe',
          email: 'jane@example.com',
          preferredContact: 'email',
          message: 'Do you deliver to Altona?',
        },
        text,
      ),
    },
    {
      slug: 'registration-received',
      shows: 'registrationReceived',
      group: 'Signing up and getting in',
      title: 'Registration received (to the applicant)',
      note: 'Sent on sign-up. Deliberately actionless: the account cannot sign in until staff approve it.',
      content: registrationReceivedMail(text),
    },
    {
      slug: 'new-registration',
      group: 'Signing up and getting in',
      title: 'New registration (to the shop)',
      note: 'Everything the applicant submitted, for a manager deciding whether they are a customer the shop knows.',
      content: newRegistrationMail(
        {
          email: 'jane@example.com',
          firstName: 'Jane',
          lastName: 'Doe',
          phone: '+49 40 1234567',
          customerType: 'company',
          companyName: 'Kontor GmbH',
          companyRegistrationId: 'DE123456789',
        },
        text,
      ),
    },
    {
      slug: 'invitation-approved',
      shows: 'invitationApproved',
      group: 'Signing up and getting in',
      title: 'Invitation — registration approved',
      note: 'The link that sets the first password, for an account staff approved.',
      content: invitationMail('invite-token', text, 'approved'),
    },
    {
      slug: 'invitation-created',
      shows: 'invitationCreated',
      group: 'Signing up and getting in',
      title: 'Invitation — account created by staff',
      note: 'The same link for an account nobody applied for, so it says where the account came from.',
      content: invitationMail('invite-token', text, 'created'),
    },
    {
      slug: 'password-reset',
      shows: 'passwordReset',
      group: 'The account itself',
      title: 'Password reset',
      note: 'Requested from the login form, or sent by staff on the account holder’s behalf. The link lives an hour.',
      content: passwordResetMail('reset-token', text),
    },
    {
      slug: 'account-deleted',
      shows: 'accountDeleted',
      group: 'The account itself',
      title: 'Account deleted',
      note: 'Confirms the deletion the customer asked for. Past orders are anonymised, not removed.',
      content: accountDeletedMail(text),
    },
    {
      slug: 'order-received-guest',
      group: 'Orders',
      shows: 'receipt',
      title: 'Order received — guest',
      note: 'The receipt. For a guest the token link is the only record of what they sent.',
      content: orderReceivedMail(order, TOKEN, currency, text),
    },
    {
      slug: 'order-received-account',
      group: 'Orders',
      title: 'Order received — account holder',
      note: 'The same receipt without a capability link: they can open the order signed in.',
      content: orderReceivedMail(order, null, currency, text),
    },
    {
      slug: 'new-order',
      group: 'Orders',
      title: 'New order (to the shop)',
      note: 'The staff notification, linking into the admin order view.',
      content: newOrderMail(order, currency, text),
    },
    {
      slug: 'order-approved',
      group: 'Orders',
      shows: 'approved',
      title: 'Order approved',
      note: 'The shop accepting the order — and, where it is invoiced, the point money starts being owed.',
      content: orderStatusChangedMail(
        at('approved'),
        'approved',
        'moved',
        null,
        currency,
        text,
      ),
    },
    {
      slug: 'order-approved-with-instructions',
      group: 'Orders',
      shows: 'approved+attached',
      title: 'Order approved, with payment instructions attached',
      note: 'The same move carrying the shop’s payment file, which the body says so the reader looks for it.',
      content: orderStatusChangedMail(
        at('approved'),
        'approved',
        'moved',
        null,
        currency,
        text,
        [],
        true,
      ),
    },
    {
      slug: 'order-ready-delivery',
      group: 'Orders',
      shows: 'readyDelivery',
      title: 'Order ready — delivery',
      note: 'One status read two ways. This half says where the order is going.',
      content: orderStatusChangedMail(
        at('ready'),
        'ready',
        'moved',
        null,
        currency,
        text,
      ),
    },
    {
      slug: 'order-ready-pickup',
      group: 'Orders',
      shows: 'readyPickup',
      title: 'Order ready — pickup',
      note: 'The other half of `ready`: the office it is waiting at, not an address.',
      content: orderStatusChangedMail(
        { ...pickupOrder, status: 'ready' },
        'ready',
        'moved',
        null,
        currency,
        text,
      ),
    },
    {
      slug: 'order-completed',
      group: 'Orders',
      shows: 'completed',
      title: 'Order completed',
      note: 'The end of the forward chain. Sent once — a reopened order completed again is quiet by default.',
      content: orderStatusChangedMail(
        at('completed'),
        'completed',
        'moved',
        null,
        currency,
        text,
      ),
    },
    {
      slug: 'order-declined',
      group: 'Orders',
      shows: 'declined',
      title: 'Order declined',
      note: 'A refusal quotes its reason: being told no without being told why is the mail nobody can answer.',
      content: orderStatusChangedMail(
        declinedOrder,
        'declined',
        'moved',
        null,
        currency,
        text,
      ),
    },
    {
      slug: 'order-cancelled',
      group: 'Orders',
      shows: 'cancelled',
      title: 'Order cancelled',
      note: 'The other ending, carrying the note staff wrote when they called it off.',
      content: orderStatusChangedMail(
        cancelledOrder,
        'cancelled',
        'moved',
        null,
        currency,
        text,
      ),
    },
    {
      slug: 'order-reopened',
      group: 'Orders',
      shows: 'reopened',
      title: 'Order reopened',
      note: 'An order that had ended is being answered again, so the mail says it is back at the start.',
      content: orderStatusChangedMail(
        at('requested'),
        'requested',
        'moved',
        null,
        currency,
        text,
      ),
    },
    {
      slug: 'order-corrected',
      group: 'Orders',
      title: 'Order walked back',
      note: 'Staff undoing a step. It says so first: the status sentence alone would read as progress.',
      content: orderStatusChangedMail(
        at('approved'),
        'approved',
        'corrected',
        null,
        currency,
        text,
      ),
    },
    {
      slug: 'order-changed',
      group: 'Orders',
      shows: 'changed',
      title: 'Order changed',
      note: 'An adjustment that moved nothing. Every change since the customer was last written to, in the shop’s words.',
      content: orderStatusChangedMail(
        at('approved'),
        'approved',
        'changed',
        null,
        currency,
        text,
        CHANGES,
      ),
    },
    {
      slug: 'order-changed-guest',
      group: 'Orders',
      title: 'Order changed — guest',
      note: 'The same message for a reader with no account: the link is the token, not their order page.',
      content: orderStatusChangedMail(
        at('approved'),
        'approved',
        'changed',
        TOKEN,
        currency,
        text,
        CHANGES,
      ),
    },
    {
      slug: 'order-document',
      group: 'Orders',
      shows: 'paymentInstructions',
      title: 'Payment instructions',
      note: 'A file arriving on its own. It announces no step and repeats no lines.',
      content: orderDocumentMail(
        at('approved'),
        'payment-instructions',
        null,
        currency,
        text,
      ),
    },
  ];
}

/** The demo set, which is what the specs assert against. */
export const mailPreviews = buildMailPreviews(demoMailText);

/**
 * Which preview shows the message an order journey names. Derived rather than
 * written out, so a preview that stops existing cannot leave a dangling link
 * behind it.
 */
export const mailPreviewByKind: Readonly<Record<string, string>> =
  Object.fromEntries(
    mailPreviews
      .filter((preview) => preview.shows)
      .map((preview) => [preview.shows as string, preview.slug]),
  );

export interface RenderedMailPreview extends MailPreview {
  readonly rendered: RenderedMail;
}

/** The previews as a recipient would receive them, both parts. */
export function renderMailPreviews(
  text: MailText = demoMailText,
  branding: MailBranding = demoMailBranding,
): readonly RenderedMailPreview[] {
  return buildMailPreviews(text).map((preview) => ({
    ...preview,
    rendered: renderMail(preview.content, branding, text.common.footerNote),
  }));
}
