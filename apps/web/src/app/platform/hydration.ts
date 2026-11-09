import {
  provideClientHydration,
  withEventReplay,
  withHttpTransferCacheOptions,
} from '@angular/platform-browser';

import { API_REQUEST } from './orpc-client';

/**
 * The transfer cache widened to a signed-in render's answers, which carry the
 * forwarded cookie and come back `private, no-store`; such a page is marked
 * private itself (private-page.server.ts). Only our API's answers ride along.
 */
export function provideHydration() {
  return provideClientHydration(
    withEventReplay(),
    withHttpTransferCacheOptions({
      includeRequestsWithAuthHeaders: true,
      includeNonCacheableRequests: true,
      filter: (req) => req.context.get(API_REQUEST),
    }),
  );
}
