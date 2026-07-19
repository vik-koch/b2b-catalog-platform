import { Controller } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import { PageService } from './page.service';
import { pageContract } from '@b2b-catalog-platform/shared';

@Controller()
export class PageController {
  constructor(private readonly pageService: PageService) {}

  // validateResponses makes zod enforce the contract's response shape —
  // without it the raw DB row (including the internal id column) leaks out.
  @TsRestHandler(pageContract.getPage, { validateResponses: true })
  async getPageBySlug() {
    return tsRestHandler(pageContract.getPage, async ({ params: { slug } }) => {
      const page = await this.pageService.getPage(slug);
      if (!page) {
        return { status: 404, body: { message: 'Page not found' } };
      }
      return { status: 200, body: page };
    });
  }
}
