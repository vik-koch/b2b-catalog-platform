import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { adminOperationsContract } from '@b2b-catalog-platform/shared/admin/platform';
import { Auth } from '../../auth/auth.decorator';
import { OperationsService } from './operations.service';

@Controller()
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  // Managers reach the admin panel too, and "what is deployed" is not an admin
  // secret: it is the first thing either role needs when reporting a problem.
  @Auth('admin', 'manager')
  @Implement(adminOperationsContract.getBuildInfo)
  getBuildInfo() {
    return implement(adminOperationsContract.getBuildInfo).handler(async () =>
      this.operations.getBuildInfo(),
    );
  }

  @Auth('admin')
  @Implement(adminOperationsContract.listSettingChanges)
  listSettingChanges() {
    return implement(adminOperationsContract.listSettingChanges).handler(
      async () => ({ changes: await this.operations.listChanges() }),
    );
  }
}
