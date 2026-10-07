import { HttpException } from '@nestjs/common';
import { ORPCError } from '@orpc/nest';
import { CodeDeliveryError } from './code-delivery';
import { CodeResendLimitError } from './sign-in-codes';

/**
 * A step call that sends a message, with its failures restated as the
 * contract's refusals.
 */
export async function sending<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof CodeResendLimitError) {
      // Thrown as the contract's own error, not a coded Nest exception: the
      // refusal carries data, which only an ORPCError can.
      throw new ORPCError('code-resend-limit', {
        status: 429,
        message: 'No new code yet',
        data: { retryAfter: Math.ceil(error.retryAfterMs / 1000) },
      });
    }
    if (error instanceof CodeDeliveryError) {
      throw error.reason === 'unreachable'
        ? new HttpException(
            { code: 'phone-unreachable', message: error.message },
            400,
          )
        : new HttpException(
            { code: 'code-delivery-unavailable', message: error.message },
            503,
          );
    }
    throw error;
  }
}
