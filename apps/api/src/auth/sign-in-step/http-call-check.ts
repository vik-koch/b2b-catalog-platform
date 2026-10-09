import { Logger } from '@nestjs/common';
import * as z from 'zod';
import {
  CallCheck,
  CallCheckRequest,
  CallCheckStarted,
  CallCheckStatus,
} from './call-check';
import { CodeDeliveryError } from './code-delivery';

/** Long enough for a provider that answers slowly, short enough that the
 * person waiting is told something before they give up. */
const TIMEOUT_MS = 10_000;

const startedSchema = z.object({
  callTo: z.string().regex(/^\+\d{6,15}$/),
  reference: z.string().min(1).max(200),
  /** Seconds. */
  expiresIn: z.number().int().positive(),
});

const statusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'expired']),
});

/**
 * Hands a call check to the deployment's own sidecar, which talks to the real
 * provider (ADR 0066). The contract is the whole of what the platform knows:
 *
 * - `POST {url}/checks` with `{ phone }` answers `{ callTo, reference,
 *   expiresIn }`, or `422` when the provider refused the number.
 * - `GET {url}/checks/{reference}` answers `{ status }`: `pending`,
 *   `confirmed` or `expired`.
 * - Both carry a bearer token where one is configured, and anything else is
 *   the provider being unavailable.
 *
 * The number is never logged: it is personal.
 */
export class HttpCallCheck implements CallCheck {
  readonly channel = 'phone';
  private readonly logger = new Logger('HttpCallCheck');
  private readonly base: string;

  constructor(
    url: string,
    private readonly token: string | undefined,
  ) {
    this.base = url.replace(/\/+$/, '');
  }

  async start(request: CallCheckRequest): Promise<CallCheckStarted> {
    const response = await this.fetch('/checks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: request.phone }),
    });
    if (response.status === 422) {
      throw new CodeDeliveryError('unreachable', 'Provider refused the number');
    }
    const answer = this.parse(startedSchema, await this.read(response));
    return {
      callTo: answer.callTo,
      reference: answer.reference,
      expiresInMs: answer.expiresIn * 1000,
    };
  }

  async status(reference: string): Promise<CallCheckStatus> {
    const response = await this.fetch(
      `/checks/${encodeURIComponent(reference)}`,
      { method: 'GET' },
    );
    return this.parse(statusSchema, await this.read(response)).status;
  }

  private async fetch(path: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(this.base + path, {
        ...init,
        headers: {
          ...init.headers,
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn(`Call sidecar unreachable: ${(error as Error).message}`);
      throw new CodeDeliveryError('unavailable', 'Call sidecar unreachable');
    }
  }

  /** The answer's body, where it is a success; otherwise the provider is
   * unavailable. */
  private async read(response: Response): Promise<unknown> {
    if (!response.ok) {
      this.logger.warn(`Call sidecar answered ${response.status}`);
      throw new CodeDeliveryError('unavailable', 'Call sidecar refused');
    }
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  /** An answer of the wrong shape is a provider that cannot be relied on. */
  private parse<T>(schema: z.ZodType<T>, body: unknown): T {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      this.logger.warn('Call sidecar answered an unexpected shape');
      throw new CodeDeliveryError('unavailable', 'Unexpected answer');
    }
    return parsed.data;
  }
}
