import { BadRequestException } from '@nestjs/common';

import type { PhoneRule } from '../../platform/config/deployment-config';

/**
 * The number to store for one entered on an account, through any door.
 * `undefined` is not sent, empty is none. The stored value passes unread, so
 * an old or imported number cannot block correcting a name beside it.
 */
export function storedPhone(
  rule: PhoneRule,
  entered: string | null | undefined,
  current?: string | null,
): string | null | undefined {
  if (entered === undefined) return undefined;
  const trimmed = entered?.trim() ?? '';
  if (!trimmed) return null;
  if (current != null && trimmed === current) return current;

  const phone = rule(trimmed);
  if (phone === null) {
    throw new BadRequestException({
      code: 'phone-format',
      message: 'Phone number does not match the configured format',
    });
  }
  return phone;
}
