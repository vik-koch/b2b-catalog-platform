import { ApiTokenScope } from '@b2b-catalog-platform/shared';
import { applyDecorators, UseGuards } from '@nestjs/common';
import { MachineScope } from './machine-scope.decorator';
import { MachineTokenGuard } from './machine-token.guard';

/**
 * Guards a route as machine-only: `@Machine('catalog-sync')`.
 *
 * A route wearing this accepts a bearer token and nothing else — a signed-in
 * admin's cookie does not reach it, and the session guards do not run: a
 * machine endpoint is never an admin endpoint with an extra way in.
 *
 * One capability per route, whatever the token happens to carry: a handler
 * names the single thing it needs, and the token satisfies it or does not. The
 * scope is required rather than defaulted, so adding a machine route cannot
 * silently accept every token there is.
 */
export const Machine = (scope: ApiTokenScope) =>
  applyDecorators(UseGuards(MachineTokenGuard), MachineScope(scope));
