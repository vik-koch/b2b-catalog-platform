/**
 * Server-side wording for the inquiry texts — the labels the shop sees in
 * the message the form generates (the API's analog of the frontend AppText).
 * Single-locale like the rest of the app (i18n is out of scope): each
 * deployment ships its one language here.
 *
 * Kept out of env.ts because it is prose, not operational config, and grouped
 * (`inquiry.name`) so it reads as it grows. A deployment overrides the whole
 * catalog as one unit via the INQUIRY_TEXT provider.
 */
export interface InquiryText {
  /** The email the inquiry form sends to the shop. */
  readonly inquiry: {
    /** Subject prefix; the submitter's name is appended after a colon. */
    readonly subject: string;
    readonly name: string;
    readonly email: string;
    readonly phone: string;
    readonly preferredContact: string;
    readonly message: string;
  };
}

/** Demo-shop English defaults; also the fallback when a deployment adds none. */
export const defaultInquiryText: InquiryText = {
  inquiry: {
    subject: 'Inquiry',
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    preferredContact: 'Preferred contact',
    message: 'Message',
  },
};

export const INQUIRY_TEXT = 'INQUIRY_TEXT';
