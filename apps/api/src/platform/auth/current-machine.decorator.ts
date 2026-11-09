import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';

import { MachineClient, MachineRequest } from './machine-client';

/** The authenticated machine client. Absent means a missing `@Machine()`
 * guard: a 500, never anonymous. */
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
