import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { pageContract } from '@b2b-catalog-platform/shared/core/site';
import { PageService } from './page.service';

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
}
