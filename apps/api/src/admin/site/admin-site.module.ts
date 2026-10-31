import { Module } from '@nestjs/common';
import { AdminPagesController } from './pages.controller';
import { PageEditorService } from './page-editor.service';
import { AuthModule } from '../../auth/auth.module';

/** The admin's page editor, behind the `@Auth` guards AuthModule supplies. */
@Module({
  imports: [AuthModule],
  controllers: [AdminPagesController],
  providers: [PageEditorService],
})
export class AdminSiteModule {}
