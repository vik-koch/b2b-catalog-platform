import { CodeDelivery } from './code-delivery';

/**
 * How a deployment proves the account's number (ADR 0066): a code sent to it,
 * or a call from it. The provider decides, so it is chosen where the adapter
 * is, and the rest of the step follows.
 */
export type SignInProof = {
  readonly kind: 'code';
  readonly delivery: CodeDelivery;
};

export const SIGN_IN_PROOF = 'SIGN_IN_PROOF';

/** Whether the person acts on the mailbox rather than the phone. */
export function byMail(proof: SignInProof): boolean {
  return proof.delivery.channel === 'email';
}
