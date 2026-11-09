import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';

import { inquiryContract } from '@b2b-catalog-platform/shared/storefront/site';

import { refusals } from '../../platform/orpc/refusals';
import { PublicFormThrottle } from '../../platform/throttling/throttle-presets';
import { InquiryService } from './inquiry.service';

@Controller()
export class InquiryController {
  constructor(private readonly inquiryService: InquiryService) {}

  @PublicFormThrottle()
  @Implement(inquiryContract.submit)
  submit() {
    return (
      implement(inquiryContract.submit)
        // The consent refusals are raised by the service.
        .use(refusals)
        .handler(async ({ input: { body } }) => {
          await this.inquiryService.submit(body);
          return { ok: true as const };
        })
    );
  }
}
