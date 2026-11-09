import { Reflector } from '@nestjs/core';

/**
 * The scope a machine route requires. Its own file because the maintenance
 * gate reads it too, without the guard's database dependency. Applied through
 * the exchange's `Machine()`, which names the scopes there are.
 */
export const MachineScope = Reflector.createDecorator<string>();
