import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AUTH_COOKIE } from './auth.constants';
import { AuthenticatedRequest } from './authenticated-request';
import { JwtAuthGuard } from './jwt-auth.guard';

const validClaims = {
  sub: '00000000-0000-0000-0000-000000000001',
  email: 'admin@example.com',
  role: 'admin',
};

const contextWith = (cookies: Record<string, string>) => {
  const request = { cookies } as unknown as AuthenticatedRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
};

describe('JwtAuthGuard', () => {
  const verifyAsync = jest.fn();
  const guard = new JwtAuthGuard({ verifyAsync } as unknown as JwtService);

  beforeEach(() => verifyAsync.mockReset());

  it('rejects a request with no session cookie', async () => {
    const { context } = contextWith({});

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects when token verification fails', async () => {
    verifyAsync.mockRejectedValue(new Error('bad signature'));
    const { context } = contextWith({ [AUTH_COOKIE]: 'tampered' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a validly signed token whose claims are malformed', async () => {
    verifyAsync.mockResolvedValue({ sub: 'not-a-uuid', role: 'wizard' });
    const { context } = contextWith({ [AUTH_COOKIE]: 'token' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('attaches the user and passes for a valid token', async () => {
    verifyAsync.mockResolvedValue(validClaims);
    const { context, request } = contextWith({ [AUTH_COOKIE]: 'token' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({
      id: validClaims.sub,
      email: validClaims.email,
      role: validClaims.role,
    });
  });
});
