import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { apiTokensContract } from '@b2b-catalog-platform/shared';
import { MachineThrottle } from '../throttling/throttle-presets';
import { CurrentMachine } from './current-machine.decorator';
import { Machine } from './machine.decorator';
import { MachineClient } from './machine-client';

/**
 * What a machine client may reach with nothing but its token. Its own
 * controller because the guard is declared at class level and the two
 * authentication paths must not share one: a route added here can never
 * acquire a session by accident, and a route added to the admin controller can
 * never acquire a token.
 *
 * One route today: what this token is. It exists so a credential can be
 * verified before it is used in anger — by an automated client at boot, by an
 * operator with `curl` — and it says only what the caller already holds.
 */
@Machine('catalog-sync')
@MachineThrottle()
@Controller()
export class MachineController {
  @Implement(apiTokensContract.machineIdentity)
  machineIdentity(@CurrentMachine() machine: MachineClient) {
    return implement(apiTokensContract.machineIdentity).handler(() => ({
      name: machine.name,
      scopes: machine.scopes,
    }));
  }
}
