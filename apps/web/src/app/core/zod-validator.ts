import { AbstractControl, ValidatorFn } from '@angular/forms';
import type { ZodType } from 'zod';

/**
 * Adapts a Zod schema — a field schema from the shared API contract — into an
 * Angular validator, so the client enforces exactly the format/length rule the
 * server does instead of a hand-rolled near-copy that drifts.
 * Returns `{ [error]: true }` on failure so the template can map it.
 */
export function zodValidator(schema: ZodType, error = 'zod'): ValidatorFn {
  return (control: AbstractControl) =>
    schema.safeParse(control.value).success ? null : { [error]: true };
}
