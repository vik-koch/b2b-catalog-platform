import type { Mock } from 'vitest';
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiTokensService } from './api-tokens.service';
import { MachineClient, MachineRequest } from './machine-client';
import { MachineTokenGuard } from './machine-token.guard';

const client: MachineClient = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Nightly import',
  scopes: ['catalog-sync'],
};

const contextFor = (request: MachineRequest): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

const withHeaders = (headers: MachineRequest['headers']): MachineRequest => ({
  headers,
});

describe('MachineTokenGuard', () => {
  const tokens = { authenticate: vi.fn() } as unknown as ApiTokensService;
  const reflector = { getAllAndOverride: vi.fn() } as unknown as Reflector;
  const guard = new MachineTokenGuard(tokens, reflector);

  const requireScope = (scope: unknown) =>
    (reflector.getAllAndOverride as Mock).mockReturnValue(scope);

  beforeEach(() => {
    (reflector.getAllAndOverride as Mock).mockReset();
    (tokens.authenticate as Mock).mockReset();
  });

  it('admits a live token whose scope covers the route', async () => {
    requireScope('catalog-sync');
    (tokens.authenticate as Mock).mockResolvedValue({
      client,
      revoked: false,
    });
    const request = withHeaders({ authorization: 'Bearer abc.def' });

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(tokens.authenticate).toHaveBeenCalledWith('abc.def');
    expect(request.machine).toEqual(client);
  });

  it('refuses a route that declares no scope, rather than admitting every token', async () => {
    requireScope(undefined);

    await expect(
      guard.canActivate(contextFor(withHeaders({}))),
    ).rejects.toThrow(ForbiddenException);
    expect(tokens.authenticate).not.toHaveBeenCalled();
  });

  it('refuses a request with no bearer header', async () => {
    requireScope('catalog-sync');

    await expect(
      guard.canActivate(contextFor(withHeaders({}))),
    ).rejects.toThrow(UnauthorizedException);
  });

  /** The session cookie is not an alternative credential here — that is the
   * whole discipline of the machine path. */
  it('refuses a request carrying only a session cookie', async () => {
    requireScope('catalog-sync');

    await expect(
      guard.canActivate(contextFor(withHeaders({ cookie: 'session=abc' }))),
    ).rejects.toThrow(UnauthorizedException);
    expect(tokens.authenticate).not.toHaveBeenCalled();
  });

  it('refuses a value that matches no token', async () => {
    requireScope('catalog-sync');
    (tokens.authenticate as Mock).mockResolvedValue(null);

    await expect(
      guard.canActivate(
        contextFor(withHeaders({ authorization: 'Bearer nope' })),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('refuses a revoked token the same way, and does not populate the request', async () => {
    requireScope('catalog-sync');
    (tokens.authenticate as Mock).mockResolvedValue({ client, revoked: true });
    const request = withHeaders({ authorization: 'Bearer abc.def' });

    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(request.machine).toBeUndefined();
  });

  it("forbids a live token that does not carry the route's capability", async () => {
    requireScope('some-other-capability');
    (tokens.authenticate as Mock).mockResolvedValue({
      client,
      revoked: false,
    });

    await expect(
      guard.canActivate(
        contextFor(withHeaders({ authorization: 'Bearer abc.def' })),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  /** One credential for a client that does several things — the reason the
   * column is a set. */
  it("admits a token carrying the route's capability among others", async () => {
    requireScope('catalog-sync');
    (tokens.authenticate as Mock).mockResolvedValue({
      client: {
        ...client,
        scopes: ['some-other-capability', 'catalog-sync'],
      },
      revoked: false,
    });

    await expect(
      guard.canActivate(
        contextFor(withHeaders({ authorization: 'Bearer abc.def' })),
      ),
    ).resolves.toBe(true);
  });
});
