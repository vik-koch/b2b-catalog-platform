import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRow, UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

const user = (overrides: Partial<UserRow> = {}): UserRow =>
  ({
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@example.com',
    passwordHash: '$argon2id$stored',
    role: 'admin',
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

  const service = new AuthService(
    users as unknown as UsersService,
    passwords as unknown as PasswordService,
    jwt as unknown as JwtService,
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
    it('rejects when the current password is wrong', async () => {
      users.findById.mockResolvedValue(user());
      passwords.verify.mockResolvedValue(false);

      await expect(
        service.changePassword(user().id, 'wrong', 'new-password'),
      ).rejects.toThrow(BadRequestException);
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
