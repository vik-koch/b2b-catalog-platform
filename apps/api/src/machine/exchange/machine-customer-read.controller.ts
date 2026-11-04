import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { machineCustomerReadContract } from '@b2b-catalog-platform/shared/machine/exchange';
import { refusals } from '../../platform/orpc/refusals';
import { Machine } from '../../platform/auth/machine.decorator';
import { MachineThrottle } from '../../platform/throttling/throttle-presets';
import { CustomerReadService } from './customer-read.service';

/**
 * The outbound read of customers (FR-ADM-18). `customer-read` is apart from
 * `customer-sync`: reading the book and writing to accounts are different
 * powers. Not refused while nobody owns customers, since it exists for the
 * weeks before the hand-over.
 */
@Machine('customer-read')
@MachineThrottle()
@Controller()
export class MachineCustomerReadController {
  constructor(private readonly service: CustomerReadService) {}

  @Implement(machineCustomerReadContract.listAccounts)
  listAccounts() {
    return implement(machineCustomerReadContract.listAccounts)
      .use(refusals)
      .handler(({ input }) => this.service.listAccounts(input.query));
  }
}
