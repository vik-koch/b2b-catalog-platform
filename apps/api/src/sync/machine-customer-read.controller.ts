import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { machineCustomerReadContract } from '@b2b-catalog-platform/shared';
import { Machine } from '../api-tokens/machine.decorator';
import { refusals } from '../orpc/refusals';
import { MachineThrottle } from '../throttling/throttle-presets';
import { CustomerReadService } from './customer-read.service';

/**
 * The outbound read (FR-ADM-18): what a connected system may learn about the
 * shop's customers.
 *
 * Its own controller because the guard names one capability per class, and
 * this one is deliberately not the exchange's. `customer-read` grants reading
 * the customer book; `customer-sync` grants writing to people's accounts. They
 * are different powers over different risks, an operator has real reason to
 * want one without the other — a system reading for weeks before it is handed
 * the pen, a feed that only pushes tiers — and keeping them apart costs one
 * value in an enum.
 *
 * Unlike every write in this area it is **not** refused while nobody owns
 * customers. A read carries no instruction, and the case it exists for is
 * exactly the one where the area has not been handed over yet.
 */
@Machine('customer-read')
@MachineThrottle()
@Controller()
export class MachineCustomerReadController {
  constructor(private readonly service: CustomerReadService) {}

  @Implement(machineCustomerReadContract.listAccounts)
  listAccounts() {
    return (
      implement(machineCustomerReadContract.listAccounts)
        // A bad cursor travels as its code rather than as a 500 with the code
        // stripped off — see `refusals`.
        .use(refusals)
        .handler(({ input }) => this.service.listAccounts(input.query))
    );
  }
}
