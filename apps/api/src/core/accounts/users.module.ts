import { Module } from '@nestjs/common';
import { UsersService } from './users.service';

/**
 * Owns the `users` table (find an account, set its password).
 *
 * DatabaseModule is global, so this only provides and exports the service.
 */
@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
