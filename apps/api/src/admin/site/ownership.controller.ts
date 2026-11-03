import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { adminOwnershipContract } from '@b2b-catalog-platform/shared/admin/site';
import { Auth } from '../../platform/auth/auth.decorator';
import { CurrentUser } from '../../platform/auth/current-user.decorator';
import { OwnershipSwitch } from './ownership-switch';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';

@Controller()
export class OwnershipController {
  constructor(private readonly ownership: OwnershipSwitch) {}

  @Auth('admin')
  @Implement(adminOwnershipContract.getOwnership)
  getOwnership() {
    return implement(adminOwnershipContract.getOwnership).handler(() =>
      this.ownership.read(),
    );
  }

  @Auth('admin')
  @Implement(adminOwnershipContract.setOwnership)
  setOwnership(@CurrentUser() user: AuthUser) {
    return implement(adminOwnershipContract.setOwnership).handler(
      ({ input: { body } }) => this.ownership.set(body.areas, body.owned, user),
    );
  }
}
