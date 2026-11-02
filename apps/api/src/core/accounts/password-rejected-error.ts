import { PasswordRejectionCode } from '@b2b-catalog-platform/shared/core/accounts';

/** A password the policy refuses, with the rule's code. Not an HTTP
 * exception: each route that sets a password maps it to its own refusal. */
export class PasswordRejectedError extends Error {
  constructor(
    readonly code: PasswordRejectionCode,
    message: string,
  ) {
    super(message);
  }
}
