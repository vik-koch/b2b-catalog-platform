import { Database } from '../../platform/db/database';
import { SessionAccounts } from './session-accounts';

const account = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'jane@example.com',
  role: 'user',
  status: 'active',
  tokenVersion: 2,
};

function accountsWith(rows: unknown[]) {
  const db = {
    select: () => ({ from: () => ({ where: async () => rows }) }),
  } as unknown as Database;
  return new SessionAccounts(db);
}

describe('SessionAccounts', () => {
  it('answers an active account', async () => {
    await expect(accountsWith([account]).find(account.id)).resolves.toBe(
      account,
    );
  });

  it('answers an account that is gone as none', async () => {
    await expect(accountsWith([]).find(account.id)).resolves.toBeUndefined();
  });

  it.each(['pending', 'invited', 'disabled', 'anonymized'] as const)(
    'answers a %s account as none',
    async (status) => {
      await expect(
        accountsWith([{ ...account, status }]).find(account.id),
      ).resolves.toBeUndefined();
    },
  );
});
