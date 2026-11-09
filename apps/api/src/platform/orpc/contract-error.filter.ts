import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';

import { codedRefusal } from './refusals';

/**
 * A guard's refusal is thrown before oRPC sees the request, so Nest answers it,
 * in a shape the contract client reads as a fault and loses the code. This
 * restates a coded one as `{ defined, code, status, message, data }`; anything
 * else, such as the media routes outside any contract, keeps Nest's shape.
 */
@Catch(HttpException)
export class ContractErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const refusal = codedRefusal(exception);

    if (!refusal) {
      response.status(status).json(exception.getResponse());
      return;
    }

    response.status(status).json({
      defined: true,
      code: refusal.code,
      status,
      message: refusal.message ?? exception.message,
      // Where the contract's own errors carry a payload, such as the sync
      // upload's `params`.
      ...(Object.keys(refusal.data).length > 0 ? { data: refusal.data } : {}),
    });
  }
}
