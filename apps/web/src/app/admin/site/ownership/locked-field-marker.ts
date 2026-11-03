import { Component, computed, input, signal } from '@angular/core';
import { type FieldTree } from '@angular/forms/signals';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Popover } from '@b2b-catalog-platform/ui/overlay/popover';
import { lockIcon } from '@b2b-catalog-platform/ui/icons/glyphs/lock';

/**
 * The mark beside a field an external system owns (FR-ADM-10) — a lock the
 * admin can ask about.
 *
 * Drawn while the field is disabled with a reason, and the reason is what it
 * says: the rule that locks the field is the only place that decides it. A
 * field disabled without one, such as a threshold with nothing to measure
 * against, is not locked by anyone and shows no lock.
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
  imports: [Icon, Popover],
  host: {
    class: 'relative inline-flex align-middle',
    '[style.display]': "reason() ? null : 'none'",
  },
  template: `
    <button
      type="button"
      class="inline-flex items-center rounded-sm p-0.5 text-ink-subtle"
      [attr.aria-label]="reason()"
      [attr.aria-expanded]="open()"
      (click)="open.set(!open())"
    >
      <ui-icon [glyph]="lockIcon" class="size-3.5" />
    </button>

    @if (open()) {
      <ui-popover align="start" (dismissed)="open.set(false)">
        <p class="text-sm">{{ reason() }}</p>
      </ui-popover>
    }
  `,
})
export class LockedFieldMarker<T> {
  protected readonly lockIcon = lockIcon;
  readonly field = input.required<FieldTree<T>>();

  protected readonly reason = computed(
    () =>
      this.field()()
        .disabledReasons()
        .find((reason) => reason.message)?.message ?? null,
  );
  protected readonly open = signal(false);
}
