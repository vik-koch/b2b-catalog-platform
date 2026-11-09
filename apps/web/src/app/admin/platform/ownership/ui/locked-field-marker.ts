import { Component, computed, input, signal } from '@angular/core';
import { type FieldTree } from '@angular/forms/signals';

import { lockIcon } from '@b2b-catalog-platform/ui/icons/glyphs/lock';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Popover } from '@b2b-catalog-platform/ui/overlay/popover';

/**
 * The lock beside a field an external system owns (FR-ADM-10), shown while the
 * field is disabled with a reason, and saying that reason. A button rather
 * than a tooltip: a disabled input fires no pointer events, and a button
 * answers tap, click and keyboard alike.
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
