import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

import { AuthenticatedRequest } from './authenticated-request';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SessionUser } from './session-users';
import { Session, Sessions } from './sessions';

const session = (overrides: Partial<SessionUser> = {}): Session => ({
  payload: {
    sub: '00000000-0000-0000-0000-000000000001',
    email: 'admin@example.com',
    role: 'admin',
    tokenVersion: 0,
  },
  user: {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@example.com',
    role: 'admin',
    status: 'active',
    tokenVersion: 0,
    mustChangePassword: false,
    ...overrides,
  } as SessionUser,
});

const context = () => {
  const request = { cookies: {} } as unknown as AuthenticatedRequest;
  const response = {};
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { context, request, response };
};

describe('JwtAuthGuard', () => {
  const read = vi.fn();
  const renew = vi.fn();
  const guard = new JwtAuthGuard({ read, renew } as unknown as Sessions);

  beforeEach(() => {
    read.mockReset();
    renew.mockReset();
  });

  it('rejects a request without a valid session', async () => {
    read.mockResolvedValue(null);

    await expect(guard.canActivate(context().context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(renew).not.toHaveBeenCalled();
  });

  it('puts the account from the row on the request', async () => {
    read.mockResolvedValue(session({ role: 'user' }));
    const { context: ctx, request } = context();

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toEqual({
      id: '00000000-0000-0000-0000-000000000001',
      email: 'admin@example.com',
      role: 'user',
      mustChangePassword: false,
    });
  });

  it('hands the session over to be renewed', async () => {
    const valid = session();
    read.mockResolvedValue(valid);
    const { context: ctx, request, response } = context();

    await guard.canActivate(ctx);
    expect(renew).toHaveBeenCalledWith(request, response, valid);
  });
});
