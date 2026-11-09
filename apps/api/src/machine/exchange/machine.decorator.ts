import { applyDecorators, UseGuards } from '@nestjs/common';

import { ApiTokenScope } from '@b2b-catalog-platform/shared/core/exchange';

import { MachineScope } from '../../platform/auth/machine-scope.decorator';
import { MachineTokenGuard } from '../../platform/auth/machine-token.guard';

/**
 * Machine-only, `@Machine('catalog-sync')`: a bearer token and nothing else,
 * never a session. One required scope, so a new machine route cannot accept
 * every token there is.
 */
export const Machine = (scope: ApiTokenScope) =>
  applyDecorators(UseGuards(MachineTokenGuard), MachineScope(scope));
