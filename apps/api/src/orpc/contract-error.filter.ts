import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Renders a coded refusal in the shape the contract client reads.
 *
 * Two things raise a refusal, and only one of them goes through the contract
 * layer. A handler's own error is oRPC's to serialize; a **guard's** is thrown
 * before oRPC ever sees the request, so Nest's default filter answers it —
 * with `{ code, message, statusCode }`, which the client rejects. It requires
 * exactly `{ defined, code, status, message, data }`, so anything else is
 * treated as an unrecognised fault and the code is lost. That is the whole
 * difference between "your session expired" and "something broke".
 *
 * Only exceptions whose body carries a `code` are rewritten — those are the
 * declared refusals. Everything else keeps Nest's own shape: the media routes
 * are plain controllers outside any contract, and their errors are not ours to
 * restate.
 */
@Catch(HttpException)
export class ContractErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse();

    const code =
      typeof body === 'object' && body !== null && 'code' in body
        ? (body as { code: unknown }).code
        : undefined;

    if (typeof code !== 'string') {
      response.status(status).json(body);
      return;
    }

    const message =
      typeof body === 'object' && body !== null && 'message' in body
        ? (body as { message: unknown }).message
        : undefined;

    response.status(status).json({
      // The guarded routes all declare these codes, which is what `defined`
      // asserts: the client may switch on this one rather than treat it as a
      // fault it cannot interpret.
      defined: true,
      code,
      status,
      message: typeof message === 'string' ? message : exception.message,
    });
  }
}
