import { Controller } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import { contactContract } from '@b2b-catalog-platform/shared';
import { ContactService } from './contact.service';

@Controller()
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  // ts-rest validates the request body against the contract before this runs,
  // so an invalid submission is a 400 without reaching the service.
  @TsRestHandler(contactContract.submit)
  async submit() {
    return tsRestHandler(contactContract.submit, async ({ body }) => {
      await this.contactService.submit(body);
      return { status: 200, body: { ok: true } };
    });
  }
}
