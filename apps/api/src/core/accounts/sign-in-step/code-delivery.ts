/**
 * Sending a sign-in code (FR-AUTH-12). An adapter delivers the platform's
 * code and answers the code to expect: its own where the provider makes one.
 * Never queued like mail: the person is waiting on the code screen.
 */
export interface CodeMessage {
  /** Canonical (`+` country code and digits). */
  readonly phone: string;
  readonly code: string;
  /** The whole message, code included, in the deployment's words. */
  readonly text: string;
  /** The account's address, for an adapter that delivers by mail. */
  readonly email: string;
}

export interface CodeDelivery {
  /** Where codes actually arrive, so the screen can say so. */
  readonly channel: 'sms' | 'email';
  send(message: CodeMessage): Promise<{ code: string }>;
}

/** `unreachable`: the provider refused the number. `unavailable`: the
 * provider failed, and the sign-in stops, since nothing skips the step. */
export class CodeDeliveryError extends Error {
  constructor(
    readonly reason: 'unreachable' | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
