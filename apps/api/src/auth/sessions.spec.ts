import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { AUTH_COOKIE } from '@b2b-catalog-platform/shared';
import { UserRow } from '../users/users.service';
import { JwtPayload } from './jwt-payload';
import { Sessions } from './sessions';

const DAY_S = 24 * 60 * 60;

const user = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'jane@example.com',
  role: 'user',
  tokenVersion: 2,
} as UserRow;

describe('Sessions', () => {
  const jwt = new JwtService({ secret: 'a-session-secret-0123456789abcdef' });
  const sessions = new Sessions(30, jwt);
  const req = { secure: false } as Request;

  let set: Record<string, { value: string; maxAge: number }>;
  const res = {
    cookie: (name: string, value: string, options: { maxAge: number }) => {
      set[name] = { value, maxAge: options.maxAge };
    },
  } as unknown as Response;

  beforeEach(() => {
    set = {};
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
});
