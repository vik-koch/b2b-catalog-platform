import { randomBytes, randomInt } from 'node:crypto';
import { OrderReferenceConfig } from '@b2b-catalog-platform/shared/core/ordering';

/**
 * `{prefix}-YYMMDD-NNNN`: readable down a phone, dated, and with a random
 * suffix, so a reference does not tell how many orders a day the shop takes.
 * Collisions are retried against the unique index. The date is the
 * deployment's own day.
 */

export const ORDER_REFERENCE_ATTEMPTS = 5;

export function orderReferenceDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}${part('month')}${part('day')}`;
}

export function orderReference(
  config: OrderReferenceConfig,
  timeZone: string,
  now: Date = new Date(),
  suffix: string = String(randomInt(0, 10_000)).padStart(4, '0'),
): string {
  return `${config.prefix}-${orderReferenceDate(now, timeZone)}-${suffix}`;
}

/**
 * The capability a guest's mailed link carries (FR-NOTIF-06): random, like a
 * password-reset token.
 */
export function orderPublicToken(): string {
  return randomBytes(24).toString('base64url');
}
