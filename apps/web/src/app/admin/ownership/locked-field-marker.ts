import { Component, inject, signal } from '@angular/core';
import { ADMIN_TEXT } from '../../config/admin-text';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Popover } from '../../ui/popover';

/**
 * The mark beside a field an external system owns (FR-ADM-10) — a lock the
 * admin can ask about.
 *
 * It sits next to the label rather than repeating the explanation under every
 * field: the banner at the top of the editor says what is going on and where
 * to change it, and this says which fields it is about. Six copies of the same
 * paragraph in one form is noise, and noise is what stops the sentence being
 * read at all.
 *
 * One trigger for both pointers rather than a hover tooltip and a tap variant.
 * A `disabled` input fires no pointer events in Chrome or Firefox, so the
 * hover target could not be the field itself in any case; making it a real
 * button means it answers a tap, a click and the keyboard with one code path,
 * and screen readers get a name for it.
 */
@Component({
  selector: 'app-locked-field-marker',
  imports: [AdminIcon, Popover],
  host: { class: 'relative inline-flex align-middle' },
  template: `
    <button
      type="button"
      class="inline-flex items-center rounded-sm p-0.5 text-subtle focus-visible:ring focus-visible:ring-ring focus-visible:outline-none"
      [attr.aria-label]="text.fieldLockedShort"
      [attr.aria-expanded]="open()"
      (click)="open.set(!open())"
    >
      <app-admin-icon name="lock" class="h-3.5 w-3.5" />
    </button>

    @if (open()) {
      <app-popover align="start" (dismissed)="open.set(false)">
        <p class="text-sm">{{ text.fieldLockedShort }}</p>
      </app-popover>
    }
  `,
})
export class LockedFieldMarker {
  protected readonly text = inject(ADMIN_TEXT).ownership;
  protected readonly open = signal(false);
}
