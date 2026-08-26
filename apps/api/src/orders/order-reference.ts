import { randomBytes, randomInt } from 'node:crypto';
import { OrderReferenceConfig } from '@b2b-catalog-platform/shared';

/**
 * What an order is called, and what a mailed link to it carries.
 *
 * `{prefix}-YYMMDD-NNNN`: short enough to read down a phone, dated so staff can
 * place it at a glance, and with a **random** suffix rather than a counter —
 * a sequence would tell everyone who ever gets a reference how many orders the
 * shop takes in a day. Collisions are therefore possible and are retried
 * against the unique index rather than pre-checked; ten thousand suffixes
 * against a day's orders is a low enough chance that the retry is a formality,
 * and a bounded loop that fails loudly is better than a number that can lie.
 *
 * The date is read in the deployment's own timezone: a customer quoting
 * yesterday's order must not be told it is tomorrow's.
 */

export const ORDER_REFERENCE_ATTEMPTS = 5;

export function orderReferenceDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
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
  now: Date = new Date(),
  suffix: string = String(randomInt(0, 10_000)).padStart(4, '0'),
): string {
  return `${config.prefix}-${orderReferenceDate(now, config.timezone)}-${suffix}`;
}

/**
 * The capability a guest's mailed link carries (FR-NOTIF-06). It is the only
 * credential for that view, so it is generated like a password-reset token
 * rather than derived from anything about the order.
 */
export function orderPublicToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Postgres' unique-violation code — a collided reference, retried. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === '23505'
  );
}
