import { Reflector } from '@nestjs/core';
import { ApiTokenScope } from '@b2b-catalog-platform/shared';

/**
 * The scope a machine route requires. Its own file because the maintenance
 * gate reads it too, without the guard's database dependency. Applied through
 * `Machine()`.
 */
export const MachineScope = Reflector.createDecorator<ApiTokenScope>();
