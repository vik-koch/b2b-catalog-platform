import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { SessionUser, SessionUsers } from './session-users';
import { JwtPayload } from './jwt-payload';
import { Sessions } from './sessions';
import { AUTH_COOKIE } from '@b2b-catalog-platform/shared/platform';

const DAY_S = 24 * 60 * 60;

const user = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'jane@example.com',
  role: 'user',
  tokenVersion: 2,
} as SessionUser;

describe('Sessions', () => {
  const jwt = new JwtService({ secret: 'a-session-secret-0123456789abcdef' });
  const find = vi.fn();
  const sessions = new Sessions(30, jwt, { find } as unknown as SessionUsers);
  const req = { secure: false } as Request;

  let set: Record<string, { value: string; maxAge: number }>;
  const res = {
    cookie: (name: string, value: string, options: { maxAge: number }) => {
      set[name] = { value, maxAge: options.maxAge };
    },
  } as unknown as Response;

  beforeEach(() => {
    set = {};
    find.mockReset();
  });

  it('signs the identity and tokenVersion, for as long as the idle limit', async () => {
    await sessions.start(req, res, user);

    const token = set[AUTH_COOKIE];
    expect(token.maxAge).toBe(30 * DAY_S * 1000);
    const claims = await jwt.verifyAsync<JwtPayload & { exp: number }>(
      token.value,
    );
    expect(claims).toMatchObject({
      sub: user.id,
      email: user.email,
      role: 'user',
      tokenVersion: 2,
    });
    expect(claims.exp - (claims.iat ?? 0)).toBe(30 * DAY_S);
  });

  describe('read', () => {
    const withCookie = (token?: string) =>
      ({ cookies: token ? { [AUTH_COOKIE]: token } : {} }) as Request;

    const signed = async (claims: Partial<JwtPayload> = {}) =>
      jwt.signAsync({
        sub: user.id,
        email: user.email,
        role: user.role,
        tokenVersion: user.tokenVersion,
        ...claims,
      });

    it('does no work without a cookie', async () => {
      await expect(sessions.read(withCookie())).resolves.toBeNull();
      expect(find).not.toHaveBeenCalled();
    });

    it('reads a forged token as no session', async () => {
      const forged = await new JwtService({
        secret: 'another-secret-0123456789abcdefgh',
      }).signAsync({ sub: user.id, tokenVersion: 2 });

      await expect(sessions.read(withCookie(forged))).resolves.toBeNull();
      expect(find).not.toHaveBeenCalled();
    });

    it('reads a session whose account is gone as none', async () => {
      find.mockResolvedValue(undefined);

      await expect(
        sessions.read(withCookie(await signed())),
      ).resolves.toBeNull();
    });

    it('reads a session whose tokenVersion moved on as none', async () => {
      find.mockResolvedValue({ ...user, tokenVersion: 3 });

      await expect(
        sessions.read(withCookie(await signed())),
      ).resolves.toBeNull();
    });

    it('answers the row, not the token, for a valid session', async () => {
      const row = { ...user, role: 'manager' } as SessionUser;
      find.mockResolvedValue(row);

      const session = await sessions.read(
        withCookie(await signed({ role: 'user' })),
      );

      expect(find).toHaveBeenCalledWith(user.id);
      expect(session?.user).toBe(row);
      expect(session?.payload.role).toBe('user');
    });
  });

  const issuedAgo = (seconds: number) => ({
    user,
    payload: {
      sub: user.id,
      email: user.email,
      role: 'user' as const,
      tokenVersion: 2,
      iat: Math.floor(Date.now() / 1000) - seconds,
    },
  });

  it('leaves a token under a day old alone', async () => {
    await sessions.renew(req, res, issuedAgo(DAY_S - 60));

    expect(set).toEqual({});
  });

  it('reissues a token in use that is over a day old', async () => {
    await sessions.renew(req, res, issuedAgo(DAY_S + 60));

    expect(set[AUTH_COOKIE]).toBeDefined();
  });

  it('reissues nothing where there is no response to carry it', async () => {
    await sessions.renew(req, undefined, issuedAgo(2 * DAY_S));

    expect(set).toEqual({});
  });
});
