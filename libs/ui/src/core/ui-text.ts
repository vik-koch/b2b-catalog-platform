import { InjectionToken } from '@angular/core';

/** The words the lib's own pieces say, in the app's language. */
export interface UiText {
  /** Read after a required group's name by a screen reader. */
  readonly required: string;
  /** Caption and accessible name of a missing picture. */
  readonly imagePlaceholder: string;
  /** The toggle under something cut short, before and after it opens. */
  readonly showMore: string;
  readonly showLess: string;
  /** `status` holds `{page}` and `{total}`. */
  readonly pagination: {
    readonly previous: string;
    readonly next: string;
    readonly status: string;
  };
}

export const UI_TEXT = new InjectionToken<UiText>('UI_TEXT');
