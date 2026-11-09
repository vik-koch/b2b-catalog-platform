import { Module } from '@nestjs/common';

import { env } from '../../platform/env';
import { createPartySuggestionPort } from './http-party-suggestions';
import { PartySuggestionController } from './party-suggestion.controller';
import { PARTY_SUGGESTION_PORT } from './party-suggestion.port';

/** Company suggestions (FR-AUTH-09), used before an account exists. */
@Module({
  controllers: [PartySuggestionController],
  providers: [
    {
      provide: PARTY_SUGGESTION_PORT,
      useFactory: () => createPartySuggestionPort(env.SUGGESTION_SIDECAR_URL),
    },
  ],
})
export class PartiesModule {}
