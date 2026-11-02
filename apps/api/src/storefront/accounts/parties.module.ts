import { Module } from '@nestjs/common';
import { env } from '../env';
import { PartySuggestionController } from './party-suggestion.controller';
import {
  PARTY_SUGGESTION_PORT,
  createPartySuggestionPort,
} from './party-suggestion.port';

/**
 * Company suggestion (FR-AUTH-09). Its own module rather than a corner of the
 * address book: the registration form uses it before an account exists, so
 * nothing here is account-scoped.
 */
@Module({
  controllers: [PartySuggestionController],
  providers: [
    {
      // Resolved once at boot, from the environment alone: a sidecar to call,
      // or plain typing. Nothing about it reaches the browser.
      provide: PARTY_SUGGESTION_PORT,
      useFactory: () => createPartySuggestionPort(env.SUGGESTION_SIDECAR_URL),
    },
  ],
})
export class PartiesModule {}
