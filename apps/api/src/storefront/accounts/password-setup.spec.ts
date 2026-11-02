import { UserRow } from '../users/users.service';
import { PasswordSetupService } from './password-setup.service';

/**
 * Redeeming a set-a-password link, and the ordering that decides what a
 * failure costs.
 *
 * The link is single-use and the visitor cannot re-issue it themselves: a
 * staff invitation is re-sent by staff, and a reset asks for a fresh mail. So
 * anything that spends the link without setting a password locks the person
 * out until somebody else acts. Everything that can fail — the policy check,
 * and the hashing, which is by design the slowest and hungriest step here —
 * therefore runs while the link is still worth something.
 */
const user = (overrides: Partial<UserRow> = {}): UserRow =>
  ({
    id: 'u1',
    email: 'alex@example.com',
    status: 'invited',
    ...overrides,
  }) as UserRow;

function build(
  options: {
    hashFails?: boolean;
    consentAsked?: boolean;
    consentGiven?: boolean;
    consentRefused?: boolean;
    role?: UserRow['role'];
  } = {},
) {
  const calls: string[] = [];

  const tokens = {
    userIdFor: vi.fn(async () => 'u1'),
    redeem: vi.fn(async () => {
      calls.push('redeem');
      return 'u1';
    }),
  };
  const users = {
    findById: vi.fn(async () => user({ role: options.role ?? 'user' })),
    setPasswordFromToken: vi.fn(async () => {
      calls.push('write');
      return user({ status: 'active' });
    }),
  };
  const passwords = {
    hash: vi.fn(async () => {
      calls.push('hash');
      if (options.hashFails) throw new Error('out of memory');
      return 'argon2-hash';
    }),
  };
  const policy = {
    assertAcceptable: vi.fn(() => {
      calls.push('policy');
    }),
  };

  const consents = {
    isAsked: vi.fn(() => options.consentAsked ?? false),
    hasGiven: vi.fn(async () => options.consentGiven ?? false),
    check: vi.fn(async () => {
      calls.push('consent');
      if (options.consentRefused) throw new Error('consent-stale');
      return { purpose: 'account', pageVersionId: 'v-1' };
    }),
    record: vi.fn(async () => {
      calls.push('record');
    }),
  };

  // Hands the callback a handle of its own, so a test can tell the writes
  // that went through the transaction from those that did not.
  const tx = { name: 'tx' };
  const db = {
    transaction: vi.fn(async (write: (handle: unknown) => unknown) =>
      write(tx),
    ),
  };

  const setup = new PasswordSetupService(
    users as never,
    tokens as never,
    passwords as never,
    policy as never,
    consents as never,
    db as never,
  );

  return { setup, tokens, users, passwords, policy, consents, calls, tx };
}

describe('PasswordSetupService.redeem', () => {
  it('sets the password and spends the link', async () => {
    const { setup, users, calls } = build();

    await expect(setup.redeem('raw-token', 'a good password')).resolves.toEqual(
      expect.objectContaining({ status: 'active' }),
    );
    expect(users.setPasswordFromToken).toHaveBeenCalledWith(
      'u1',
      'argon2-hash',
      expect.anything(),
    );
    // Both checks, then the hash, and only then the link.
    expect(calls).toEqual(['policy', 'hash', 'redeem', 'write']);
  });

  /**
   * The one that used to burn the link: hashing ran after redemption, so a
   * failure in it left the visitor holding a spent link and the old password.
   */
  it('leaves the link usable when hashing fails', async () => {
    const { setup, tokens, users } = build({ hashFails: true });

    await expect(setup.redeem('raw-token', 'a good password')).rejects.toThrow(
      'out of memory',
    );
    expect(tokens.redeem).not.toHaveBeenCalled();
    expect(users.setPasswordFromToken).not.toHaveBeenCalled();
  });

  it('leaves the link usable when the password is refused', async () => {
    const { setup, tokens, policy } = build();
    policy.assertAcceptable.mockImplementation(() => {
      throw new Error('too common');
    });

    await expect(setup.redeem('raw-token', 'password')).rejects.toThrow(
      'too common',
    );
    expect(tokens.redeem).not.toHaveBeenCalled();
  });

  /**
   * Two submissions of the same link race: the conditional update matches no
   * row for the second, and the hashing it did is thrown away rather than
   * written over the password the first one set.
   */
  it('writes nothing when the link was spent in the meantime', async () => {
    const { setup, users, tokens } = build();
    tokens.redeem.mockResolvedValue(null as never);

    await expect(
      setup.redeem('raw-token', 'a good password'),
    ).resolves.toBeNull();
    expect(users.setPasswordFromToken).not.toHaveBeenCalled();
  });

  it('refuses an unknown link without asking for an account', async () => {
    const { setup, users, tokens } = build();
    tokens.userIdFor.mockResolvedValue(null as never);

    await expect(
      setup.redeem('raw-token', 'a good password'),
    ).resolves.toBeNull();
    expect(users.findById).not.toHaveBeenCalled();
  });

  it('refuses a link belonging to a closed account', async () => {
    const { setup, users, tokens } = build();
    users.findById.mockResolvedValue(user({ status: 'anonymized' }));

    await expect(
      setup.redeem('raw-token', 'a good password'),
    ).resolves.toBeNull();
    expect(tokens.redeem).not.toHaveBeenCalled();
  });
});

describe('the account consent on a first password (NFR-LEGAL-09)', () => {
  it('is checked before the link is spent, and recorded after', async () => {
    const { setup, consents, tokens, users, calls, tx } = build({
      consentAsked: true,
    });

    await setup.redeem('raw-token', 'a good password', 2);

    expect(consents.check).toHaveBeenCalledWith('account', 2);
    expect(calls).toEqual([
      'policy',
      'consent',
      'hash',
      'redeem',
      'write',
      'record',
    ]);
    // One transaction: a record that fails takes the password and the spent
    // link back with it, so the next attempt is asked again.
    expect(tokens.redeem).toHaveBeenCalledWith('raw-token', tx);
    expect(users.setPasswordFromToken).toHaveBeenCalledWith(
      'u1',
      'argon2-hash',
      tx,
    );
    expect(consents.record).toHaveBeenCalledWith(
      { purpose: 'account', pageVersionId: 'v-1' },
      { userId: 'u1', email: 'alex@example.com' },
      tx,
    );
  });

  it('leaves the link usable when the consent is refused', async () => {
    const { setup, tokens } = build({
      consentAsked: true,
      consentRefused: true,
    });

    await expect(setup.redeem('raw-token', 'a good password')).rejects.toThrow(
      'consent-stale',
    );
    expect(tokens.redeem).not.toHaveBeenCalled();
  });

  it('is not asked again of an account that gave it when registering', async () => {
    const { setup, consents } = build({
      consentAsked: true,
      consentGiven: true,
    });

    await expect(setup.describe('raw-token')).resolves.toMatchObject({
      consentRequired: false,
    });
    await setup.redeem('raw-token', 'a good password');
    expect(consents.check).not.toHaveBeenCalled();
  });

  it('is not asked of staff', async () => {
    const { setup } = build({ consentAsked: true, role: 'manager' });

    await expect(setup.describe('raw-token')).resolves.toMatchObject({
      consentRequired: false,
    });
  });

  it('is asked of an invited customer while the deployment asks for it', async () => {
    const asked = build({ consentAsked: true });
    const notAsked = build({ consentAsked: false });

    await expect(asked.setup.describe('raw-token')).resolves.toMatchObject({
      purpose: 'set',
      consentRequired: true,
    });
    await expect(notAsked.setup.describe('raw-token')).resolves.toMatchObject({
      consentRequired: false,
    });
  });
});
