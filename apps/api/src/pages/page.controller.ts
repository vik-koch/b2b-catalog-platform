import { Controller } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import { PageService } from './page.service';
import { AuthUser, pageContract } from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

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

  // Admin only. The body is sanitized in the service.
  @Auth('admin')
  @TsRestHandler(pageContract.updatePage, { validateResponses: true })
  async updatePage(@CurrentUser() user: AuthUser) {
    return tsRestHandler(
      pageContract.updatePage,
      async ({ params: { slug }, body }) => {
        const page = await this.pageService.updatePage(slug, body, user.id);
        if (!page) {
          // Should never happen as it is already guarded
          return { status: 404, body: { message: 'Page not found' } };
        }
        return { status: 200, body: page };
      },
    );
  }
}
