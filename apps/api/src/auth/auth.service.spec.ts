import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRow, UsersService } from '../users/users.service';
import { AuthService, WrongCurrentPasswordError } from './auth.service';
import { PasswordPolicy, PasswordRejectedError } from './password-policy';
import { PasswordService } from './password.service';

const user = (overrides: Partial<UserRow> = {}): UserRow =>
  ({
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@example.com',
    passwordHash: '$argon2id$stored',
    role: 'admin',
    status: 'active',
    tokenVersion: 2,
    mustChangePassword: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as UserRow;

describe('AuthService', () => {
  const users = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    setPassword: jest.fn(),
  };
  const passwords = { hash: jest.fn(), verify: jest.fn() };
  const jwt = { signAsync: jest.fn() };

  // A policy that accepts everything: what it refuses is PasswordPolicy's own
  // spec, and this one is about credentials and session state.
  const policy = { assertAcceptable: jest.fn() } as unknown as PasswordPolicy;

  const service = new AuthService(
    users as unknown as UsersService,
    passwords as unknown as PasswordService,
    jwt as unknown as JwtService,
    policy,
  );

  beforeEach(() => jest.clearAllMocks());

  describe('validate', () => {
    it('returns the user when the password matches', async () => {
      const existing = user();
      users.findByEmail.mockResolvedValue(existing);
      passwords.verify.mockResolvedValue(true);

      await expect(
        service.validate('admin@example.com', 'right'),
      ).resolves.toBe(existing);
    });

    it('returns null when the password is wrong', async () => {
      users.findByEmail.mockResolvedValue(user());
      passwords.verify.mockResolvedValue(false);

      await expect(
        service.validate('admin@example.com', 'wrong'),
      ).resolves.toBeNull();
    });

    it('still verifies a dummy hash for an unknown email (constant timing)', async () => {
      users.findByEmail.mockResolvedValue(undefined);
      passwords.hash.mockResolvedValue('$argon2id$dummy');
      passwords.verify.mockResolvedValue(false);

      await expect(
        service.validate('nobody@example.com', 'x'),
      ).resolves.toBeNull();
      // A hash was still verified rather than short-circuiting on the miss.
      expect(passwords.verify).toHaveBeenCalledWith('$argon2id$dummy', 'x');
    });

    it.each(['pending', 'anonymized'] as const)(
      'returns null for a %s account even with the right password',
      async (status) => {
        users.findByEmail.mockResolvedValue(user({ status }));
        passwords.verify.mockResolvedValue(true);

        await expect(
          service.validate('admin@example.com', 'right'),
        ).resolves.toBeNull();
      },
    );
  });

  describe('signToken', () => {
    it('signs the identity plus the current tokenVersion', async () => {
      jwt.signAsync.mockResolvedValue('signed');

      await service.signToken(user());

      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: user().id,
        email: user().email,
        role: 'admin',
        tokenVersion: 2,
      });
    });
  });

  describe('changePassword', () => {
    // The forced first change (FR-AUTH-08) exists so a handed-out password is
    // replaced; keeping it would defeat the whole mechanism.
    it('refuses a new password identical to the current one', async () => {
      users.findById.mockResolvedValue(user());
      passwords.verify.mockResolvedValue(true);

      await expect(
        service.changePassword(user().id, 'same-password', 'same-password'),
      ).rejects.toThrow(PasswordRejectedError);
      expect(users.setPassword).not.toHaveBeenCalled();
    });

    it('rejects when the current password is wrong', async () => {
      users.findById.mockResolvedValue(user());
      passwords.verify.mockResolvedValue(false);

      await expect(
        service.changePassword(user().id, 'wrong', 'new-password'),
      ).rejects.toThrow(WrongCurrentPasswordError);
      expect(users.setPassword).not.toHaveBeenCalled();
    });

    it('rejects when the user is gone', async () => {
      users.findById.mockResolvedValue(undefined);

      await expect(
        service.changePassword('missing', 'x', 'new-password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('hashes and stores the new password on success', async () => {
      users.findById.mockResolvedValue(user());
      passwords.verify.mockResolvedValue(true);
      passwords.hash.mockResolvedValue('$argon2id$new');
      users.setPassword.mockResolvedValue(user({ tokenVersion: 3 }));

      await service.changePassword(user().id, 'current', 'new-password');

      expect(passwords.hash).toHaveBeenCalledWith('new-password');
      expect(users.setPassword).toHaveBeenCalledWith(
        user().id,
        '$argon2id$new',
      );
    });

    // The same policy the invitation link applies: a rule that guards only one
    // of the two doors guards nothing.
    it('refuses a password the policy rejects, and stores nothing', async () => {
      users.findById.mockResolvedValue(user());
      passwords.verify.mockResolvedValue(true);
      // Once: `clearAllMocks` clears calls but keeps implementations, so a
      // persistent throw here would fail every later test in this block.
      (policy.assertAcceptable as jest.Mock).mockImplementationOnce(() => {
        throw new PasswordRejectedError('too common');
      });

      await expect(
        service.changePassword(user().id, 'current', 'password1234'),
      ).rejects.toThrow(PasswordRejectedError);
      expect(users.setPassword).not.toHaveBeenCalled();
    });

    it('returns the updated row, so the caller can re-issue its own cookie', async () => {
      const rotated = user({ tokenVersion: 3, mustChangePassword: false });
      users.findById.mockResolvedValue(user({ mustChangePassword: true }));
      passwords.verify.mockResolvedValue(true);
      passwords.hash.mockResolvedValue('$argon2id$new');
      users.setPassword.mockResolvedValue(rotated);

      // Without this the change would invalidate the very session that made it:
      // setPassword bumps tokenVersion, and the caller's token carries the old one.
      await expect(
        service.changePassword(user().id, 'current', 'new-password'),
      ).resolves.toBe(rotated);
    });
  });
});
