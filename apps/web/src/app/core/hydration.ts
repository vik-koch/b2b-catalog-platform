import {
  provideClientHydration,
  withEventReplay,
  withHttpTransferCacheOptions,
} from '@angular/platform-browser';
import { API_REQUEST } from './orpc-client';

/**
 * Hydration, with the transfer cache widened to what a signed-in render asks.
 *
 * The server render asks the API with the visitor's session cookie
 * (forward-session.server.ts), and the API marks what a session shaped
 * `private, no-store`. Angular would skip both — and the browser would ask
 * again, painting over a correct page with the same answer. A page that
 * embeds any such answer is marked private itself (private-page.server.ts),
 * so a response replayed from it only reaches the visitor it was rendered for.
 *
 * Only our own API's answers ride along at all: the widened rules are about
 * what that API marks, so anything else is left out of the cache entirely
 * and fetched again by the browser.
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
