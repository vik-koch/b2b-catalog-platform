import { MailContent } from '../mail-layout';
import { MailText } from '../mail-text';

/**
 * A sign-in code by mail (FR-AUTH-12), for a deployment that delivers codes
 * this way rather than to the phone. It leads with the provider's own text,
 * so what dev and the demo show is what a phone would receive.
 */
export function signInCodeMail(text: MailText, code: string): MailContent {
  const t = text.signInCode;
  return {
    subject: t.subject,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [signInCodeText(text, code), t.ignore],
  };
}

/** The message itself, as a provider sends it. */
export function signInCodeText(text: MailText, code: string): string {
  return text.signInCode.message.replaceAll('{code}', code);
}
