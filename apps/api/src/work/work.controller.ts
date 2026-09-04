import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { AuthUser, workContract } from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { WorkService } from './work.service';

@Controller()
export class WorkController {
  constructor(private readonly work: WorkService) {}

  // `@Auth()` with no roles: every signed-in account has counts of its own,
  // and the answer is shaped by who is asking (FR-WORK-04) rather than by a
  // guard. A guest has no account for anything to wait on.
  @Auth()
  @Implement(workContract.getCounts)
  getCounts(@CurrentUser() user: AuthUser) {
    return implement(workContract.getCounts).handler(() =>
      this.work.countsFor(user),
    );
  }
}
