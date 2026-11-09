import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';

import { machineOrderReadContract } from '@b2b-catalog-platform/shared/machine/exchange';

import { refusals } from '../../platform/orpc/refusals';
import { MachineThrottle } from '../../platform/throttling/throttle-presets';
import { Machine } from './machine.decorator';
import { OrderReadService } from './order-read.service';

/**
 * The outbound read of orders (FR-ADM-08), apart from the write-back's scope
 * as `customer-read` is from `customer-sync`. Not refused while nobody owns
 * orders, since it exists for the weeks before the hand-over.
 */
@Machine('order-read')
@MachineThrottle()
@Controller()
export class MachineOrderReadController {
  constructor(private readonly service: OrderReadService) {}

  @Implement(machineOrderReadContract.listOrders)
  listOrders() {
    return implement(machineOrderReadContract.listOrders)
      .use(refusals)
      .handler(({ input }) => this.service.listOrders(input.query));
  }

  @Implement(machineOrderReadContract.getOrder)
  getOrder() {
    return implement(machineOrderReadContract.getOrder)
      .use(refusals)
      .handler(({ input }) => this.service.getOrder(input.params.reference));
  }
}
