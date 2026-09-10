import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { apiTokensContract, AuthUser } from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuditLogger } from '../audit/audit.logger';
import { refusals } from '../orpc/refusals';
import { ApiTokensService } from './api-tokens.service';

/**
 * Issuing and revoking machine tokens (NFR-SEC-09) — admin-only, like every
 * other credential decision. A manager approves customers; a manager does not
 * hand out keys to the catalog.
 */
@Auth('admin')
@Controller()
export class ApiTokensController {
  constructor(
    private readonly service: ApiTokensService,
    private readonly audit: AuditLogger,
  ) {}

  @Implement(apiTokensContract.listApiTokens)
  listApiTokens() {
    return implement(apiTokensContract.listApiTokens).handler(async () => ({
      tokens: await this.service.listApiTokens(),
    }));
  }

  /**
   * The value travels in this one response and is never stored in a form
   * anything can read back, so the audit line records the row, not the secret.
   */
  @Implement(apiTokensContract.createApiToken)
  createApiToken(@CurrentUser() user: AuthUser) {
    return implement(apiTokensContract.createApiToken).handler(
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

  @Implement(apiTokensContract.revokeApiToken)
  revokeApiToken(@CurrentUser() user: AuthUser) {
    return implement(apiTokensContract.revokeApiToken)
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
