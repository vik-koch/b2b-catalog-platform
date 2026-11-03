import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { MachineClient, MachineRequest } from './machine-client';

/**
 * Injects the authenticated machine client. Only valid on routes guarded by
 * `@Machine()`, which populates it before the handler runs — an absent one is
 * a missing guard, surfaced as a 500 rather than passed off as anonymous.
 */
export const CurrentMachine = createParamDecorator(
  (_data: unknown, context: ExecutionContext): MachineClient => {
    const { machine } = context.switchToHttp().getRequest<MachineRequest>();
    if (!machine) {
      throw new InternalServerErrorException(
        'CurrentMachine used on a route without the Machine guard',
      );
    }
    return machine;
  },
);
