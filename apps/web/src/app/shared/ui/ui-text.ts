import { InjectionToken } from '@angular/core';

/** The words the lib's own pieces say, in the app's language. */
export interface UiText {
  /** Read after a required group's name by a screen reader. */
  readonly required: string;
  /** Caption and accessible name of a missing picture. */
  readonly imagePlaceholder: string;
}

export const UI_TEXT = new InjectionToken<UiText>('UI_TEXT');
