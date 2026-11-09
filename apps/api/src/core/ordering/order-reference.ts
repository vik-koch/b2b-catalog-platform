import { randomBytes, randomInt } from 'node:crypto';

import {
  ORDER_REFERENCE_DATE,
  OrderReferenceConfig,
} from '@b2b-catalog-platform/shared/core/ordering';

/**
 * A reference in the deployment's format: readable down a phone, dated, and
 * random where it says `#`. Collisions are retried against the unique index.
 * The date is the deployment's own day.
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
  digit: () => number = () => randomInt(0, 10),
): string {
  return config.format
    .split(ORDER_REFERENCE_DATE)
    .join(orderReferenceDate(now, timeZone))
    .replace(/#/g, () => String(digit()));
}

/**
 * The capability a guest's mailed link carries (FR-NOTIF-06): random, like a
 * password-reset token.
 */
export function orderPublicToken(): string {
  return randomBytes(24).toString('base64url');
}
