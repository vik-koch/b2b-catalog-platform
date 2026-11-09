import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';

import { machineIdentityContract } from '@b2b-catalog-platform/shared/machine/exchange';

import { ExchangeMachine } from '../../core/exchange/api-token-lookup';
import { CurrentMachine } from '../../platform/auth/current-machine.decorator';
import { MachineThrottle } from '../../platform/throttling/throttle-presets';
import { Machine } from './machine.decorator';

/** What this token is, so a credential can be checked before it is used. */
@Machine('catalog-sync')
@MachineThrottle()
@Controller()
export class MachineIdentityController {
  @Implement(machineIdentityContract.machineIdentity)
  machineIdentity(@CurrentMachine() machine: ExchangeMachine) {
    return implement(machineIdentityContract.machineIdentity).handler(() => ({
      name: machine.name,
      scopes: machine.scopes,
    }));
  }
}
