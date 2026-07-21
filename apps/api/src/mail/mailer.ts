/**
 * Mailer port (see ADR 0013). All outgoing email goes through this interface;
 * the concrete transport is a per-deployment adapter (SMTP by default). Inject
 * with the MAILER token.
 */
export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text?: string;
  /** Reply-To — e.g. the contact-form submitter, so the shop can reply. */
  readonly replyTo?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export const MAILER = 'MAILER';
