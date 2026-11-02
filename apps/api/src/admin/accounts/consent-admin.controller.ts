import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { AuditLogger } from '../../audit/audit.logger';
import { Auth } from '../../platform/auth/auth.decorator';
import { CurrentUser } from '../../platform/auth/current-user.decorator';
import { refusals } from '../../orpc/refusals';
import { ConsentRecords } from './consent-records';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';
import { consentsContract } from '@b2b-catalog-platform/shared/admin/accounts';

/** A person's consent records (NFR-LEGAL-09), and withdrawals entered by
 * staff. Admin only: they name people no manager screen shows. */
@Auth('admin')
@Controller()
export class ConsentAdminController {
  constructor(
    private readonly consents: ConsentRecords,
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
    return implement(consentsContract.withdrawConsent)
      .use(refusals)
      .handler(async ({ input: { params, body } }) => {
        const record = await this.consents.enterWithdrawal(
          params.id,
          admin,
          body.note,
        );
        this.audit.record('consent.withdrawn', admin, { id: record.id });
        return record;
      });
  }
}
