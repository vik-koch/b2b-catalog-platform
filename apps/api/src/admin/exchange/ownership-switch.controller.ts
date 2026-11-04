import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { adminOwnershipSwitchContract } from '@b2b-catalog-platform/shared/admin/exchange';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';
import { Auth } from '../../platform/auth/auth.decorator';
import { CurrentUser } from '../../platform/auth/current-user.decorator';
import { OwnershipSwitch } from './ownership-switch';

@Auth('admin')
@Controller()
export class OwnershipSwitchController {
  constructor(private readonly ownership: OwnershipSwitch) {}

  @Implement(adminOwnershipSwitchContract.setOwnership)
  setOwnership(@CurrentUser() user: AuthUser) {
    return implement(adminOwnershipSwitchContract.setOwnership).handler(
      ({ input: { body } }) => this.ownership.set(body.areas, body.owned, user),
    );
  }
}
