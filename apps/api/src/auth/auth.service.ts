import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthUser } from '@b2b-catalog-platform/shared';
import { UserRow, UsersService } from '../users/users.service';
import { JwtPayload } from './jwt-payload';
import { PasswordService } from './password.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
  ) {}

  /** The client-facing identity — never the hash or tokenVersion. */
  toAuthUser(user: UserRow): AuthUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  }

  /**
   * Verify credentials, returning the user or null. A hash is always verified —
   * a dummy one when the email is unknown — so a wrong email and a wrong
   * password take the same time and don't reveal which emails exist.
   *
   * An account that is not `active` fails the same way, for the same reason: a
   * distinct "awaiting approval" answer would confirm the address is registered.
   * The registration mail is where that gets explained, to the address itself.
   */
  async validate(email: string, password: string): Promise<UserRow | null> {
    const user = await this.users.findByEmail(email);
    const hash = user?.passwordHash ?? (await this.timingDummyHash());
    const ok = await this.passwords.verify(hash, password);
    if (!ok || !user || user.status !== 'active') return null;
    return user;
  }

  /** Sign a session token carrying the identity and the current tokenVersion. */
  signToken(user: UserRow): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };
    return this.jwt.signAsync(payload);
  }

  /**
   * Change the caller's own password. Requires the current one; on success the
   * tokenVersion bump (in UsersService.setPassword) logs out other sessions.
   *
   * Returns the updated row — the caller's own session token was invalidated by
   * that same bump, so the controller has to re-issue the cookie from it (see
   * AuthController.changePassword) or the change would log the caller out too.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<UserRow> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Not authenticated');
    }
    const ok = await this.passwords.verify(user.passwordHash, currentPassword);
    if (!ok) {
      throw new BadRequestException('Current password is incorrect');
    }
    const passwordHash = await this.passwords.hash(newPassword);
    return this.users.setPassword(userId, passwordHash);
  }

  // Computed once and reused: equalizes login timing for unknown emails without
  // hashing a fresh dummy on every failed attempt.
  private dummyHash?: Promise<string>;
  private timingDummyHash(): Promise<string> {
    return (this.dummyHash ??= this.passwords.hash('timing-equalizer'));
  }
}
