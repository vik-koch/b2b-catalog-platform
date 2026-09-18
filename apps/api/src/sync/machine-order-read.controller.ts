import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { machineOrderReadContract } from '@b2b-catalog-platform/shared';
import { Machine } from '../api-tokens/machine.decorator';
import { refusals } from '../orpc/refusals';
import { MachineThrottle } from '../throttling/throttle-presets';
import { OrderReadService } from './order-read.service';

/**
 * The outbound read of orders (FR-ADM-08): what a connected system may learn
 * about the orders the shop has taken.
 *
 * Its own controller because the guard names one capability per class, and
 * this one is deliberately not the write-back's. `order-read` grants seeing
 * what the shop has sold; the exchange's own scope grants moving live orders
 * and changing what they say. An operator has real reason to hand over one
 * without the other, and keeping them apart costs one value in an enum — the
 * same argument `customer-read` was split on.
 *
 * Unlike the write-back it is **not** refused while nobody owns order
 * processing. A read carries no instruction and cannot collide with the shop's
 * own work, and the case it exists for is exactly the one before the area is
 * handed over.
 */
@Machine('order-read')
@MachineThrottle()
@Controller()
export class MachineOrderReadController {
  constructor(private readonly service: OrderReadService) {}

  @Implement(machineOrderReadContract.listOrders)
  listOrders() {
    return (
      implement(machineOrderReadContract.listOrders)
        // A bad cursor travels as its code rather than as a 500 with the code
        // stripped off — see `refusals`.
        .use(refusals)
        .handler(({ input }) => this.service.listOrders(input.query))
    );
  }

  @Implement(machineOrderReadContract.getOrder)
  getOrder() {
    return implement(machineOrderReadContract.getOrder)
      .use(refusals)
      .handler(({ input }) => this.service.getOrder(input.params.reference));
  }
}
