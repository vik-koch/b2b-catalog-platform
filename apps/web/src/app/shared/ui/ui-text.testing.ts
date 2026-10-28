import { Provider } from '@angular/core';
import { UI_TEXT, UiText } from './ui-text';

/** Stand-in words for the lib's own specs; the app's live in its texts. */
export const testUiText: UiText = {
  required: 'required',
  imagePlaceholder: 'No image',
  pagination: {
    previous: 'Previous',
    next: 'Next',
    status: 'Page {page} of {total}',
  },
};

export function provideTestUiText(): Provider {
  return { provide: UI_TEXT, useValue: testUiText };
}
