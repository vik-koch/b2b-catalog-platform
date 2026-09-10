import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { PasswordTokenService } from './password-token.service';

/**
 * Issuing a set-a-password link: minting the new one and expiring whatever was
 * outstanding are one change, not two.
 *
 * A link forwarded to the wrong person stays a way in for as long as it is
 * usable, so a re-sent invitation has to leave exactly one live link behind —
 * including when two requests arrive at once, which is what the transaction is
 * for.
 */
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
  } as unknown as NodePgDatabase<typeof schema>;
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

    // 32 random bytes, base64url — what is stored is its hash.
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
