import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { AuthUser } from '@b2b-catalog-platform/shared';
import { adminPagesContract } from '@b2b-catalog-platform/shared/admin/site';
import { Auth } from '../../auth/auth.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { PageEditorService } from './page-editor.service';

@Controller()
export class AdminPagesController {
  constructor(private readonly pageEditor: PageEditorService) {}

  @Auth('admin')
  @Implement(adminPagesContract.updatePage)
  updatePage(@CurrentUser() user: AuthUser) {
    return implement(adminPagesContract.updatePage).handler(
      ({ input: { params, body } }) =>
        this.pageEditor.updatePage(params.slug, body, user),
    );
  }

  @Auth('admin')
  @Implement(adminPagesContract.listPageVersions)
  listPageVersions() {
    return implement(adminPagesContract.listPageVersions).handler(
      ({ input: { params } }) => this.pageEditor.listVersions(params.slug),
    );
  }
}
