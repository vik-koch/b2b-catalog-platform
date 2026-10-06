import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { AuthUser, consentsContract } from '@b2b-catalog-platform/shared';
import { AuditLogger } from '../audit/audit.logger';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { refusals } from '../orpc/refusals';
import { ConsentService } from './consent.service';

/**
 * Finding a person's consent records (NFR-LEGAL-09), to answer an inspection
 * or the person's own request, and entering a withdrawal that reached the
 * shop. Admin only: both are the operator's to answer, and the records name
 * people no other manager screen shows — whoever sent an inquiry.
 */
@Auth('admin')
@Controller()
export class ConsentAdminController {
  constructor(
    private readonly consents: ConsentService,
    private readonly audit: AuditLogger,
  ) {}

  @Implement(consentsContract.findConsents)
  findConsents() {
    return implement(consentsContract.findConsents).handler(
      async ({ input: { query } }) => ({
        consents: await this.consents.findByHolder(query),
      }),
    );
  }

  @Implement(consentsContract.withdrawConsent)
  withdrawConsent(@CurrentUser() admin: AuthUser) {
    return (
      implement(consentsContract.withdrawConsent)
        // The refusals are raised by the service.
        .use(refusals)
        .handler(async ({ input: { params, body } }) => {
          const record = await this.consents.enterWithdrawal(
            params.id,
            admin,
            body.note,
          );
          this.audit.record('consent.withdrawn', admin, { id: record.id });
          return record;
        })
    );
  }
}
