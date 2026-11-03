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
 * `Vary: Cookie` always, or a shared cache could serve one visitor's variant
 * to another. `private, no-store` only when a session shaped the response:
 * a private guest variant would miss the hydration transfer cache too.
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
