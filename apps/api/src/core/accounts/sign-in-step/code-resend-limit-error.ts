/** A code asked for before the account's wait is over. */
export class CodeResendLimitError extends Error {
  constructor(readonly retryAfterMs: number) {
    super('No new code yet');
  }
}
