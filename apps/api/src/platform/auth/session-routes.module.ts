import { Module } from '@nestjs/common';

import { SessionController } from './session.controller';
import { SessionModule } from './session.module';

/** The session's own routes, mounted once by the root. SessionModule stays
 * route-free, since every module with `@Auth()` routes imports it. */
@Module({
  imports: [SessionModule],
  controllers: [SessionController],
})
export class SessionRoutesModule {}
