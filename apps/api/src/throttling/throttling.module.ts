import { Global, Module } from '@nestjs/common';
import { seconds, ThrottlerModule } from '@nestjs/throttler';

/**
 * App-level rate limiting. One shared ThrottlerModule that
 * abuse-prone endpoints opt into per-route — see `PublicFormThrottle` and
 * friends in ./throttle-presets — rather than each reinventing a limiter. This
 * complements Traefik's edge limit and, unlike it, also works in dev/e2e
 * where there is no proxy.
 *
 * `@Global` so `ThrottlerGuard` resolves in any feature module without
 * re-importing here. The `default` throttler below is the fallback a guarded
 * route inherits when it carries no `@Throttle`; the presets override it.
 *
 * State is in-memory, so limits are per API instance — sufficient for the
 * single-container deployment. A shared store (Redis) is the documented upgrade
 * once the API scales beyond one replica.
 */
const throttler = ThrottlerModule.forRoot({
  throttlers: [{ name: 'default', ttl: seconds(60), limit: 60 }],
});

@Global()
@Module({
  imports: [throttler],
  // Re-export so `ThrottlerGuard` can inject the options/storage from any
  // feature module that opts in via a preset, without re-importing here.
  exports: [throttler],
})
export class ThrottlingModule {}
