import { BadRequestException } from '@nestjs/common';
import type { PhoneRule } from '../config/deployment-config';

/**
 * The number to store for one a person entered on an account, through any
 * door: registration, their own profile, or the staff editor.
 *
 * `undefined` stays `undefined` (the field was not sent) and an empty value is
 * no number. A value equal to the one already stored is kept unread: a number
 * from before the rule, or from an external system, must not stop someone from
 * correcting a name beside it. Anything else is read by the deployment's rule,
 * and refused as `phone-format` where the rule cannot read it.
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
