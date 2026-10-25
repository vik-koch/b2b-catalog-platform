import type { CommonText } from '@b2b-catalog-platform/shared';
import type { AdminText } from '../shared/config/admin-text.type';

type Fields = CommonText['fields'];

/** Each field's shared label with the check staff are told, as one object —
 * the shape a form reads, with the admin's wording in place of the customer's. */
export function staffFields(
  labels: Fields,
  checks: AdminText['fields'],
): Fields {
  const merged: Record<string, object> = {};
  for (const key of Object.keys(labels) as (keyof Fields)[]) {
    merged[key] = { ...labels[key], ...checks[key] };
  }
  return merged as unknown as Fields;
}
