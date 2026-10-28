import { InjectionToken, type Signal } from '@angular/core';

/** Whether what a field belongs to has been sent at least once. */
export interface FieldAttempt {
  readonly attempted: Signal<boolean>;
}

/**
 * Where a field reads whether to say a missing value is missing. A form
 * provides it (SubmitAttempt), and so may a part of one that is sent on its
 * own terms, such as an address that is only asked while it is being typed:
 * opened after a refusal, it should not greet the customer in red.
 */
export const FIELD_ATTEMPT = new InjectionToken<FieldAttempt>('FIELD_ATTEMPT');
