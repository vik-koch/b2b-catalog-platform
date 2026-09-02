import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { inquiryContract } from '@b2b-catalog-platform/shared';
import { InquiryService } from './inquiry.service';
import { PublicFormThrottle } from '../throttling/throttle-presets';

@Controller()
export class InquiryController {
  constructor(private readonly inquiryService: InquiryService) {}

  // Rate-limited per client IP; over the limit is a 429 before the handler
  // runs. The contract then validates the body, so an invalid submission is a
  // 400 without reaching the service.
  @PublicFormThrottle()
  @Implement(inquiryContract.submit)
  submit() {
    return implement(inquiryContract.submit).handler(
      async ({ input: { body } }) => {
        await this.inquiryService.submit(body);
        return { ok: true as const };
      },
    );
  }
}
