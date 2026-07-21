import { Controller } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import { inquiryContract } from '@b2b-catalog-platform/shared';
import { InquiryService } from './inquiry.service';

@Controller()
export class InquiryController {
  constructor(private readonly inquiryService: InquiryService) {}

  // ts-rest validates the request body against the contract before this runs,
  // so an invalid submission is a 400 without reaching the service.
  @TsRestHandler(inquiryContract.submit)
  async submit() {
    return tsRestHandler(inquiryContract.submit, async ({ body }) => {
      await this.inquiryService.submit(body);
      return { status: 200, body: { ok: true } };
    });
  }
}
