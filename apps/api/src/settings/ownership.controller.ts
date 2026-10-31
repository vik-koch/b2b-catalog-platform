import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { AuthUser } from '@b2b-catalog-platform/shared';
import { adminOwnershipContract } from '@b2b-catalog-platform/shared/admin';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { OwnershipSwitch } from './ownership-switch';

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
