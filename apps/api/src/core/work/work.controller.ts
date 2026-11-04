import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { workContract } from '@b2b-catalog-platform/shared/core/work';
import { Auth } from '../../platform/auth/auth.decorator';
import { CurrentUser } from '../../platform/auth/current-user.decorator';
import { WorkService } from './work.service';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';

@Controller()
export class WorkController {
  constructor(private readonly work: WorkService) {}

  // Any session: the service shapes the answer by role (FR-WORK-04).
  @Auth()
  @Implement(workContract.getCounts)
  getCounts(@CurrentUser() user: AuthUser) {
    return implement(workContract.getCounts).handler(() =>
      this.work.countsFor(user),
    );
  }
}
