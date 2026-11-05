import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { bearerToken } from './api-token-value';
import { MachineRequest } from './machine-client';
import { MachineScope } from './machine-scope.decorator';
import { MACHINE_TOKENS, MachineTokens } from './machine-tokens';

/**
 * Authenticates an automated client from its bearer token (NFR-SEC-09). No
 * cookie is read and no user loaded. The row is read on every request, so a
 * revocation is immediate; a route without a scope is refused.
 */
@Injectable()
export class MachineTokenGuard implements CanActivate {
  constructor(
    @Inject(MACHINE_TOKENS) private readonly tokens: MachineTokens,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride(MachineScope, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) {
      throw new ForbiddenException({
        code: 'insufficient-scope',
        message: 'Machine route declares no scope',
      });
    }

    const request = context.switchToHttp().getRequest<MachineRequest>();
    const presented = bearerToken(request.headers['authorization']);
    if (!presented) throw unauthenticated();

    const client = await this.tokens.authenticate(presented);
    if (!client) throw unauthenticated();

    if (!client.scopes.includes(required)) {
      throw new ForbiddenException({
        code: 'insufficient-scope',
        message: 'Token does not carry the capability this endpoint needs',
      });
    }

    request.machine = client;
    return true;
  }
}

function unauthenticated() {
  return new UnauthorizedException({
    code: 'not-authenticated',
    message: 'Invalid or revoked token',
  });
}
