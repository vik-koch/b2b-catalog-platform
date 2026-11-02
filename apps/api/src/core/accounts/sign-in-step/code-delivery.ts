/**
 * Sending a sign-in code (FR-AUTH-12, ADR 0066). The platform makes the code
 * and the text; an adapter delivers them and answers the code to expect —
 * the one it was given, or a provider's own where the provider makes the code
 * (a flash call's is the caller's number). Everything else — hashing, expiry,
 * attempts, resend limits — stays with the platform.
 *
 * Synchronous on purpose, never queued like mail: the person is on the code
 * screen waiting for it.
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

/**
 * Why a code did not go out, or a call check could not be started or read.
 * `unreachable`: the provider refused the number, so a different one might
 * work. `unavailable`: the provider is down, out of balance or answering
 * nonsense, and the sign-in stops — nothing skips the step.
 */
export class CodeDeliveryError extends Error {
  constructor(
    readonly reason: 'unreachable' | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
