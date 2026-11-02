import { PasswordRejectionCode } from '@b2b-catalog-platform/shared';

/**
 * A password the policy refuses, carrying the rule that refused it. The code is
 * what the browser shows a sentence for; the message is for the log.
 *
 * Its own type rather than a BadRequestException, because the two endpoints
 * that set passwords answer it differently — and because change-password
 * already has a *different* 400 ("wrong current password") that callers must be
 * able to tell apart.
 */
export class PasswordRejectedError extends Error {
  constructor(
    readonly code: PasswordRejectionCode,
    message: string,
  ) {
    super(message);
  }
}
