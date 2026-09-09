/**
 * Mailer port. All outgoing email goes through this interface;
 * the concrete transport is a per-deployment adapter (SMTP by default). Inject
 * with the MAILER token.
 */
/** A file travelling with a message. Bytes, not a path: what is attached is
 * read from the document store, which is not a filesystem the mailer knows. */
export interface MailAttachment {
  readonly fileName: string;
  readonly contentType: string;
  readonly bytes: Buffer;
}

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text?: string;
  /** Reply-To — e.g. the inquiry-form submitter, so the shop can reply. */
  readonly replyTo?: string;
  /**
   * Files sent with the message (FR-ORD-05). Only the shop's payment
   * instructions travel this way: it is the one document a customer has to act
   * on away from the site, and a link would send them back to a screen to find
   * what they were already reading. Everything else is linked.
   */
  readonly attachments?: readonly MailAttachment[];
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export const MAILER = 'MAILER';
