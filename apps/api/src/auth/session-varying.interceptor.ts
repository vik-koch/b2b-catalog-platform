import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { AuthenticatedRequest } from './authenticated-request';

/**
 * Caching rules for a public response whose body depends on the caller's
 * session — today the catalog's tier prices (FR-AUTH-05). Runs after
 * OptionalAuthGuard, which is what decides whether there was a session at all.
 *
 * `Vary: Cookie` on every response, guest or not: without it a shared cache
 * that stored the guest variant would be free to hand it to a signed-in
 * customer, and the customer's variant to the next guest.
 *
 * `private, no-store` only when a session actually shaped the response, so the
 * guest variant stays ordinarily cacheable. That distinction is load-bearing on
 * the SSR tier: Angular's hydration transfer cache refuses to carry a response
 * marked private, and the server renders session-blind — so marking every
 * response private would cost every visitor, guest and crawler included, a
 * second fetch of data the document already contained. A signed-in customer's
 * browser is made to fetch these endpoints itself by other means: the SSR tier
 * keeps them out of the transfer cache when the document request carries the
 * session cookie (see the web app's api-client.ts).
 */
@Injectable()
export class SessionVaryingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const response = http.getResponse<Response>();

    response.vary('Cookie');
    if (http.getRequest<AuthenticatedRequest>().user) {
      response.setHeader('Cache-Control', 'private, no-store');
    }

    return next.handle();
  }
}
