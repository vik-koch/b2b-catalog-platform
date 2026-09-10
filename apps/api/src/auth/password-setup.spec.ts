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

function build(options: { hashFails?: boolean } = {}) {
  const calls: string[] = [];

  const tokens = {
    userIdFor: vi.fn(async () => 'u1'),
    redeem: vi.fn(async () => {
      calls.push('redeem');
      return 'u1';
    }),
  };
  const users = {
    findById: vi.fn(async () => user()),
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

  const setup = new PasswordSetupService(
    users as never,
    tokens as never,
    passwords as never,
    policy as never,
  );

  return { setup, tokens, users, passwords, policy, calls };
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
