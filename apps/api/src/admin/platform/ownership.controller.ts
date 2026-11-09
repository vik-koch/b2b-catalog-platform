import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';

import { adminOwnershipContract } from '@b2b-catalog-platform/shared/admin/platform';

import { Auth } from '../../platform/auth/auth.decorator';
import { OwnershipState } from '../../platform/settings/ownership-state';

@Controller()
export class OwnershipController {
  constructor(private readonly ownership: OwnershipState) {}

  @Auth('admin')
  @Implement(adminOwnershipContract.getOwnership)
  getOwnership() {
    return implement(adminOwnershipContract.getOwnership).handler(async () => ({
      ownedAreas: await this.ownership.read(),
    }));
  }
}
