/** The transport port; SMTP by default. */

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
  /** Such as the inquiry's sender, so the shop can answer. */
  readonly replyTo?: string;
  /** Files sent with it (FR-ORD-05). */
  readonly attachments?: readonly MailAttachment[];
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export const MAILER = 'MAILER';
