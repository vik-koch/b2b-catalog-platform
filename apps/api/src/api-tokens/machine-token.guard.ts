import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiTokensService } from './api-tokens.service';
import { bearerToken } from './api-token-value';
import { MachineRequest } from './machine-client';
import { MachineScope } from './machine-scope.decorator';

/**
 * Authenticates an automated client from its bearer token (NFR-SEC-09).
 *
 * The whole of the machine authentication path: no cookie is read, no user is
 * loaded, and a route reached through here has no `request.user` at all. The
 * database is consulted on every request, which is what makes revocation
 * immediate — there is no version counter to propagate and no token lifetime
 * to wait out.
 *
 * Fails closed in the one way that matters: a route carrying the guard without
 * a scope is a misconfiguration, and is refused rather than allowed.
 */
@Injectable()
export class MachineTokenGuard implements CanActivate {
  constructor(
    private readonly tokens: ApiTokensService,
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

    const result = await this.tokens.authenticate(presented);
    // A value that matches nothing and one that matches a revoked row are the
    // same answer to the caller: this credential does not work. Which of the
    // two it was is the operator's business, not the client's.
    if (!result || result.revoked) throw unauthenticated();

    if (!result.client.scopes.includes(required)) {
      throw new ForbiddenException({
        code: 'insufficient-scope',
        message: 'Token does not carry the capability this endpoint needs',
      });
    }

    request.machine = result.client;
    return true;
  }
}

function unauthenticated() {
  return new UnauthorizedException({
    code: 'not-authenticated',
    message: 'Invalid or revoked token',
  });
}
