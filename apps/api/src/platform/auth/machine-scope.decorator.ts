import { Reflector } from '@nestjs/core';
import { ApiTokenScope } from '@b2b-catalog-platform/shared';

/**
 * The scope a machine route requires, read back by MachineTokenGuard — and by
 * the maintenance gate, which treats its presence as proof the route is behind
 * authentication. Its own file for that reason: the metadata key has to be
 * importable without dragging the guard and its database dependency along.
 *
 * Prefer the `Machine()` composite over applying this directly.
 */
export const MachineScope = Reflector.createDecorator<ApiTokenScope>();
