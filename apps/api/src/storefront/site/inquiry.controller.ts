import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { inquiryContract } from '@b2b-catalog-platform/shared/storefront/site';
import { InquiryService } from './inquiry.service';
import { PublicFormThrottle } from '../../throttling/throttle-presets';
import { refusals } from '../../orpc/refusals';

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
