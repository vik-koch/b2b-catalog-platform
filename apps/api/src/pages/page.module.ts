import { Module } from '@nestjs/common';
import { PageController } from './page.controller';
import { PageService } from './page.service';
import { DatabaseModule } from '../db/database.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  // AuthModule supplies JwtAuthGuard/RolesGuard for the `@Auth('admin')` edit
  // route; the read route stays public.
  imports: [DatabaseModule, AuthModule],
  controllers: [PageController],
  providers: [PageService],
})
export class PageModule {}
