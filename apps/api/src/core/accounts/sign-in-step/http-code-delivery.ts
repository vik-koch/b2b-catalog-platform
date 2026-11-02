import { Logger } from '@nestjs/common';
import * as z from 'zod';
import { SIGN_IN_CODE_LENGTH } from '@b2b-catalog-platform/shared';
import { CodeDelivery, CodeDeliveryError, CodeMessage } from './code-delivery';

/** Long enough for a provider that answers slowly, short enough that the
 * person on the code screen is told something before they give up. */
const TIMEOUT_MS = 10_000;

/** A provider that makes its own code says which; one that sends ours may say
 * nothing. */
const answerSchema = z.object({
  code: z
    .string()
    .regex(new RegExp(`^\\d{${SIGN_IN_CODE_LENGTH}}$`))
    .optional(),
});

/**
 * Hands a code to the deployment's own sidecar, which talks to the real
 * provider (ADR 0066). The contract is the whole of what the platform knows:
 *
 * - `POST {url}` with `{ phone, code, text }` and, where configured, a bearer
 *   token.
 * - `2xx`, optionally `{ code }` when the provider chose the code.
 * - `422` when the provider refused the number; anything else is the provider
 *   being unavailable.
 *
 * The message is never logged: it carries the code, and the phone is personal.
 */
export class HttpCodeDelivery implements CodeDelivery {
  readonly channel = 'sms';
  private readonly logger = new Logger('HttpCodeDelivery');

  constructor(
    private readonly url: string,
    private readonly token: string | undefined,
  ) {}

  async send(message: CodeMessage): Promise<{ code: string }> {
    let response: Response;
    try {
      response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify({
          phone: message.phone,
          code: message.code,
          text: message.text,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn(`Code sidecar unreachable: ${(error as Error).message}`);
      throw new CodeDeliveryError('unavailable', 'Code sidecar unreachable');
    }

    if (response.status === 422) {
      throw new CodeDeliveryError('unreachable', 'Provider refused the number');
    }
    if (!response.ok) {
      this.logger.warn(`Code sidecar answered ${response.status}`);
      throw new CodeDeliveryError('unavailable', 'Code sidecar refused');
    }

    const text = await response.text();
    const parsed = answerSchema.safeParse(text ? safeJson(text) : {});
    if (!parsed.success) {
      this.logger.warn('Code sidecar answered an unexpected shape');
      throw new CodeDeliveryError('unavailable', 'Unexpected answer');
    }
    return { code: parsed.data.code ?? message.code };
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
