import { Controller } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import { addressesContract, AuthUser } from '@b2b-catalog-platform/shared';
import { AuditLogger } from '../audit/audit.logger';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AddressesService } from './addresses.service';

/**
 * The signed-in account's address book. `@Auth()` with no roles, like
 * AccountController: every account has one of these, whatever it may do
 * elsewhere. The id always comes from the session, never from the request.
 */
@Auth()
@Controller()
export class AddressesController {
  constructor(
    private readonly addresses: AddressesService,
    private readonly audit: AuditLogger,
  ) {}

  @TsRestHandler(addressesContract.listAddresses, { validateResponses: true })
  listAddresses(@CurrentUser() actor: AuthUser) {
    return tsRestHandler(addressesContract.listAddresses, async () => ({
      status: 200 as const,
      body: { items: await this.addresses.list(actor.id) },
    }));
  }

  @TsRestHandler(addressesContract.createAddress, { validateResponses: true })
  createAddress(@CurrentUser() actor: AuthUser) {
    return tsRestHandler(addressesContract.createAddress, async ({ body }) => {
      const address = await this.addresses.create(actor.id, body);
      // Audited without the address itself: the trail says an account changed
      // its book, not where the customer lives.
      this.audit.record('address.created', actor, { id: address.id });
      return { status: 201 as const, body: address };
    });
  }

  @TsRestHandler(addressesContract.updateAddress, { validateResponses: true })
  updateAddress(@CurrentUser() actor: AuthUser) {
    return tsRestHandler(
      addressesContract.updateAddress,
      async ({ params, body }) => {
        const address = await this.addresses.update(actor.id, params.id, body);
        this.audit.record('address.updated', actor, { id: address.id });
        return { status: 200 as const, body: address };
      },
    );
  }

  @TsRestHandler(addressesContract.deleteAddress, { validateResponses: true })
  deleteAddress(@CurrentUser() actor: AuthUser) {
    return tsRestHandler(
      addressesContract.deleteAddress,
      async ({ params }) => {
        await this.addresses.remove(actor.id, params.id);
        this.audit.record('address.deleted', actor, { id: params.id });
        return { status: 200 as const, body: { message: 'Address deleted' } };
      },
    );
  }
}
