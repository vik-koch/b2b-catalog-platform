import { ApiTokenScope } from '@b2b-catalog-platform/shared/platform';
import { applyDecorators, UseGuards } from '@nestjs/common';
import { MachineScope } from './machine-scope.decorator';
import { MachineTokenGuard } from './machine-token.guard';

/**
 * Machine-only, `@Machine('catalog-sync')`: a bearer token and nothing else,
 * never a session. One required scope, so a new machine route cannot accept
 * every token there is.
 */
export const Machine = (scope: ApiTokenScope) =>
  applyDecorators(UseGuards(MachineTokenGuard), MachineScope(scope));
