import { CallCheck } from './call-check';
import { CodeDelivery } from './code-delivery';

/** A code sent to the number, or a call from it: the provider decides. */
export type SignInProof =
  | { readonly kind: 'code'; readonly delivery: CodeDelivery }
  | { readonly kind: 'call'; readonly check: CallCheck };

export const SIGN_IN_PROOF = 'SIGN_IN_PROOF';

/** Whether the person acts on the mailbox rather than the phone. */
export function byMail(proof: SignInProof): boolean {
  return proof.kind === 'code'
    ? proof.delivery.channel === 'email'
    : proof.check.channel === 'email';
}
