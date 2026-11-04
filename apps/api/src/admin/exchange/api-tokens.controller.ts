import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { adminApiTokensContract } from '@b2b-catalog-platform/shared/admin/exchange';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';
import { AuditLogger } from '../../audit/audit.logger';
import { refusals } from '../../orpc/refusals';
import { Auth } from '../../platform/auth/auth.decorator';
import { CurrentUser } from '../../platform/auth/current-user.decorator';
import { ApiTokensService } from './api-tokens.service';

/** Machine tokens (NFR-SEC-09): admin-only, like every credential decision. */
@Auth('admin')
@Controller()
export class ApiTokensController {
  constructor(
    private readonly service: ApiTokensService,
    private readonly audit: AuditLogger,
  ) {}

  @Implement(adminApiTokensContract.listApiTokens)
  listApiTokens() {
    return implement(adminApiTokensContract.listApiTokens).handler(
      async () => ({
        tokens: await this.service.listApiTokens(),
      }),
    );
  }

  /** The audit line records the row, never the value. */
  @Implement(adminApiTokensContract.createApiToken)
  createApiToken(@CurrentUser() user: AuthUser) {
    return implement(adminApiTokensContract.createApiToken).handler(
      async ({ input: { body } }) => {
        const token = await this.service.createApiToken(body, user);
        this.audit.record('apiToken.created', user, {
          id: token.id,
          name: token.name,
          scope: token.scopes.join(','),
        });
        return token;
      },
    );
  }

  @Implement(adminApiTokensContract.revokeApiToken)
  revokeApiToken(@CurrentUser() user: AuthUser) {
    return implement(adminApiTokensContract.revokeApiToken)
      .use(refusals)
      .handler(async ({ input: { params } }) => {
        const token = await this.service.revokeApiToken(params.id);
        this.audit.record('apiToken.revoked', user, {
          id: token.id,
          name: token.name,
        });
        return token;
      });
  }
}
