import { HttpException } from '@nestjs/common';
import { ORPCError } from '@orpc/nest';
import type { MiddlewareNextFn, MiddlewareResult } from '@orpc/server';

/** A service refusal: a Nest exception whose body carries a contract code. */
function codedRefusal(
  error: unknown,
): { code: string; message?: string; status: number } | null {
  if (!(error instanceof HttpException)) return null;

  const body = error.getResponse();
  if (typeof body !== 'object' || body === null || !('code' in body)) {
    return null;
  }
  const { code, message } = body as { code: unknown; message?: unknown };
  if (typeof code !== 'string') return null;

  return {
    code,
    message: typeof message === 'string' ? message : undefined,
    status: error.getStatus(),
  };
}

/**
 * Restates a service's refusal in the contract's terms.
 *
 * The services raise their refusals as Nest exceptions carrying `{ code,
 * message }`, which is what reached the client under the old contract layer.
 * oRPC does not recognise those: one thrown inside a handler is swallowed and
 * answered as a **500 with the code gone**, which no type check catches and no
 * service-level test sees. Rethrowing as an `ORPCError` with the same code and
 * status restores it — oRPC marks it `defined` when the pair matches the
 * procedure's error map, which is what the browser's `isDefinedError` reads.
 *
 * Anything without a code is left alone: it is a fault, not a refusal, and a
 * 500 is the honest answer.
 */
export async function refusals<TOutput>({
  next,
}: {
  next: MiddlewareNextFn<TOutput>;
}): Promise<MiddlewareResult<Record<never, never>, TOutput>> {
  try {
    // Adds nothing to the context — it only watches what comes back out.
    return await next();
  } catch (error) {
    const refusal = codedRefusal(error);
    if (!refusal) throw error;
    throw new ORPCError(refusal.code, {
      status: refusal.status,
      message: refusal.message,
    });
  }
}
