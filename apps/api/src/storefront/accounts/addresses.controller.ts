import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { AuditLogger } from '../../platform/audit/audit.logger';
import { Auth } from '../../platform/auth/auth.decorator';
import { CurrentUser } from '../../platform/auth/current-user.decorator';
import { refusals } from '../../platform/orpc/refusals';
import { AddressesService } from '../../core/accounts/addresses.service';
import { addressesContract } from '@b2b-catalog-platform/shared/core/accounts';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';

/** The signed-in account's address book, any role. The id is always the
 * session's. */
@Auth()
@Controller()
export class AddressesController {
  constructor(
    private readonly addresses: AddressesService,
    private readonly audit: AuditLogger,
  ) {}

  @Implement(addressesContract.listAddresses)
  listAddresses(@CurrentUser() actor: AuthUser) {
    return implement(addressesContract.listAddresses).handler(async () => ({
      items: await this.addresses.list(actor.id),
    }));
  }

  @Implement(addressesContract.createAddress)
  createAddress(@CurrentUser() actor: AuthUser) {
    return implement(addressesContract.createAddress)
      .use(refusals)
      .handler(async ({ input: { body } }) => {
        const address = await this.addresses.create(actor.id, body);
        // Without the address: the trail is not where the customer lives.
        this.audit.record('address.created', actor, { id: address.id });
        return address;
      });
  }

  @Implement(addressesContract.updateAddress)
  updateAddress(@CurrentUser() actor: AuthUser) {
    return implement(addressesContract.updateAddress)
      .use(refusals)
      .handler(async ({ input: { params, body } }) => {
        const address = await this.addresses.update(actor.id, params.id, body);
        this.audit.record('address.updated', actor, { id: address.id });
        return address;
      });
  }

  @Implement(addressesContract.deleteAddress)
  deleteAddress(@CurrentUser() actor: AuthUser) {
    return implement(addressesContract.deleteAddress)
      .use(refusals)
      .handler(async ({ input: { params } }) => {
        await this.addresses.remove(actor.id, params.id);
        this.audit.record('address.deleted', actor, { id: params.id });
        return { message: 'Address deleted' };
      });
  }
}
