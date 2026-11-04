import { HttpException } from '@nestjs/common';
import { ORPCError } from '@orpc/nest';
import type { MiddlewareNextFn, MiddlewareResult } from '@orpc/server';

/** A refusal's parts, where the exception's body carries a contract code; null
 * for a fault, which stays a 500. */
export function codedRefusal(error: HttpException): {
  code: string;
  message?: string;
  data: Record<string, unknown>;
} | null {
  const body = error.getResponse();
  if (typeof body !== 'object' || body === null) return null;
  const { code, message, ...data } = body as Record<string, unknown>;
  if (typeof code !== 'string') return null;
  return {
    code,
    message: typeof message === 'string' ? message : undefined,
    data,
  };
}

/**
 * Rethrows a service's coded Nest exception as an `ORPCError`. oRPC answers a
 * foreign exception thrown in a handler as a 500 with the code gone; with the
 * code and status of the procedure's error map it is marked `defined`, which is
 * what the browser's `isDefinedError` reads.
 */
export async function refusals<TOutput>({
  next,
}: {
  next: MiddlewareNextFn<TOutput>;
}): Promise<MiddlewareResult<Record<never, never>, TOutput>> {
  try {
    return await next();
  } catch (error) {
    const refusal = error instanceof HttpException ? codedRefusal(error) : null;
    if (!refusal) throw error;
    throw new ORPCError(refusal.code, {
      status: (error as HttpException).getStatus(),
      message: refusal.message,
    });
  }
}
