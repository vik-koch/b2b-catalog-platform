import { Module } from '@nestjs/common';
import { UsersService } from './users.service';

/**
 * Owns the `users` table access. DatabaseModule is global, so this only needs
 * to provide and export the service for the auth layer (and, later, user
 * management in iteration 4).
 */
@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
