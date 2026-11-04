import { Global, Module } from '@nestjs/common';
import { seconds, ThrottlerModule } from '@nestjs/throttler';

/**
 * The limiter the presets opt routes into, beside Traefik's edge limit and also
 * in dev and e2e. In memory, so limits are per API instance. Global, so
 * `ThrottlerGuard` resolves in any module.
 */
const throttler = ThrottlerModule.forRoot({
  throttlers: [{ name: 'default', ttl: seconds(60), limit: 60 }],
});

@Global()
@Module({
  imports: [throttler],
  exports: [throttler],
})
export class ThrottlingModule {}
