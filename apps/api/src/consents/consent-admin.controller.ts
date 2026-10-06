import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { consentsContract } from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { ConsentService } from './consent.service';

/**
 * Finding a person's consent records (NFR-LEGAL-09), to answer an inspection
 * or the person's own request. Admin only: both are the operator's to answer,
 * and the records name people no other manager screen shows — whoever sent an
 * inquiry.
 */
@Auth('admin')
@Controller()
export class ConsentAdminController {
  constructor(private readonly consents: ConsentService) {}

  @Implement(consentsContract.findConsents)
  findConsents() {
    return implement(consentsContract.findConsents).handler(
      async ({ input: { query } }) => ({
        consents: await this.consents.findByHolder(query),
      }),
    );
  }
}
