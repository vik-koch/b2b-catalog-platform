import { Controller } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import { inquiryContract } from '@b2b-catalog-platform/shared';
import { InquiryService } from './inquiry.service';
import { PublicFormThrottle } from '../throttling/throttle-presets';

@Controller()
export class InquiryController {
  constructor(private readonly inquiryService: InquiryService) {}

  // Rate-limited per client IP; over the limit is a 429 before the
  // handler runs. ts-rest then validates the body against the contract, so an
  // invalid submission is a 400 without reaching the service.
  @PublicFormThrottle()
  @TsRestHandler(inquiryContract.submit)
  async submit() {
    return tsRestHandler(inquiryContract.submit, async ({ body }) => {
      await this.inquiryService.submit(body);
      return { status: 200, body: { ok: true } };
    });
  }
}
