import { type SharedText } from '@b2b-catalog-platform/shared/platform';

import type { AdminText } from '../../platform/config/admin-text.type';

type Fields = SharedText['fields'];

/** Each field's shared label with the staff's check, as a form reads it,
 * worded for the admin. */
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
