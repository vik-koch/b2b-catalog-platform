/**
 * Proving a number by a call from it (FR-AUTH-12, ADR 0066). The provider
 * shows a number to call, and tells whether the call came from the number it
 * was started for. The platform keeps the reference and the limits, and asks
 * for the status while the person is on the call screen.
 */
export interface CallCheckStarted {
  /** The number to call, canonical (`+` country code and digits). */
  readonly callTo: string;
  /** The provider's handle on the check. Never leaves the API. */
  readonly reference: string;
  /** How long the check stays open. */
  readonly expiresInMs: number;
}

export type CallCheckStatus = 'pending' | 'confirmed' | 'expired';

export interface CallCheckRequest {
  /** Canonical (`+` country code and digits). */
  readonly phone: string;
  /** The account's address, for an adapter that stands in by mail. */
  readonly email: string;
}

export interface CallCheck {
  /** Where the person acts: their phone, or a mailbox that stands in for it. */
  readonly channel: 'phone' | 'email';
  /** Throws `CodeDeliveryError` where the check could not be started. */
  start(request: CallCheckRequest): Promise<CallCheckStarted>;
  /** Throws `CodeDeliveryError('unavailable')` where nobody can tell. */
  status(reference: string): Promise<CallCheckStatus>;
}
