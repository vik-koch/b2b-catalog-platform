import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { addressesContract, AuthUser } from '@b2b-catalog-platform/shared';
import { AuditLogger } from '../audit/audit.logger';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { refusals } from '../orpc/refusals';
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
        // Audited without the address itself: the trail says an account changed
        // its book, not where the customer lives.
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
