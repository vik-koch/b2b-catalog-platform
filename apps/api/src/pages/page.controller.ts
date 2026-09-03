import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { PageService } from './page.service';
import { AuthUser, pageContract } from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller()
export class PageController {
  constructor(private readonly pageService: PageService) {}

  // The contract's `.output()` schema is enforced on the way out — without it
  // the raw DB row (including the internal id column) would leak.
  @Implement(pageContract.getPage)
  getPageBySlug() {
    return implement(pageContract.getPage).handler(
      async ({ input: { params }, errors }) => {
        const page = await this.pageService.getPage(params.slug);
        if (!page) throw errors['page-not-found']();
        return page;
      },
    );
  }

  // Admin only. The body is sanitized in the service.
  @Auth('admin')
  @Implement(pageContract.updatePage)
  updatePage(@CurrentUser() user: AuthUser) {
    return implement(pageContract.updatePage).handler(
      async ({ input: { params, body }, errors }) => {
        const page = await this.pageService.updatePage(
          params.slug,
          body,
          user.id,
        );
        // Should never happen as it is already guarded
        if (!page) throw errors['page-not-found']();
        return page;
      },
    );
  }
}
