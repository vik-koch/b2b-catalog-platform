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
 * Caching rules for a public response that depends on the caller's session —
 * today the catalog's tier prices. Runs after OptionalAuthGuard.
 *
 * `Vary: Cookie` always, or a shared cache could serve one visitor's variant to
 * the other kind. `private, no-store` only when a session shaped the response:
 * marking the guest variant private would keep it out of the hydration transfer
 * cache too, costing every visitor a second fetch.
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
