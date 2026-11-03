import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { adminOwnershipSwitchContract } from '@b2b-catalog-platform/shared/admin/exchange';
import { Auth } from '../../platform/auth/auth.decorator';
import { CurrentUser } from '../../platform/auth/current-user.decorator';
import { OwnershipSwitch } from './ownership-switch';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';

@Controller()
export class OwnershipSwitchController {
  constructor(private readonly ownership: OwnershipSwitch) {}

  @Auth('admin')
  @Implement(adminOwnershipSwitchContract.setOwnership)
  setOwnership(@CurrentUser() user: AuthUser) {
    return implement(adminOwnershipSwitchContract.setOwnership).handler(
      ({ input: { body } }) => this.ownership.set(body.areas, body.owned, user),
    );
  }
}
