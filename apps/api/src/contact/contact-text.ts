/**
 * Server-side wording for the contact texts — the labels the shop sees in
 * the message the form generates (the API's analog of the frontend AppText).
 * Single-locale like the rest of the app (i18n is out of scope): each
 * deployment ships its one language here.
 *
 * Kept out of env.ts because it is prose, not operational config, and grouped
 * (`contact.name`) so it reads as it grows. A deployment overrides the whole
 * catalog as one unit via the CONTACT_TEXT provider.
 */
export interface ContactText {
  /** The email the contact form ("contact") sends to the shop. */
  readonly contact: {
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
export const defaultContactText: ContactText = {
  contact: {
    subject: 'Contact form',
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    preferredContact: 'Preferred contact',
    message: 'Message',
  },
};

export const CONTACT_TEXT = 'CONTACT_TEXT';
