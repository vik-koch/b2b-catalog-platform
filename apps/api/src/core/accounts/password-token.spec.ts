import { PasswordTokenService } from './password-token.service';
import { Database } from '../../platform/db/database';

/** Minting a password link and expiring the outstanding ones are one change:
 * a forwarded link is a way in while it lives, so a resend leaves exactly one,
 * even for two requests at once. */
function recordingDb(calls: string[]) {
  const tx = {
    update: () => ({
      set: () => ({ where: async () => calls.push('revoke') }),
    }),
    insert: () => ({ values: async () => calls.push('insert') }),
  };

  return {
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      calls.push('begin');
      await run(tx);
      calls.push('commit');
    },
  } as unknown as Database;
}

describe('PasswordTokenService.issue', () => {
  it('expires the outstanding links and mints the new one together', async () => {
    const calls: string[] = [];
    const tokens = new PasswordTokenService(recordingDb(calls));

    await tokens.issue('u1', 60_000);

    expect(calls).toEqual(['begin', 'revoke', 'insert', 'commit']);
  });

  it('returns a token that is only ever readable here', async () => {
    const tokens = new PasswordTokenService(recordingDb([]));

    const token = await tokens.issue('u1', 60_000);

    // 32 random bytes, base64url; only its hash is stored.
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
