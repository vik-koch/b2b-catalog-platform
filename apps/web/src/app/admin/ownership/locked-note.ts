import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { lockIcon } from '@b2b-catalog-platform/ui/icons/glyphs/lock';
import { Notice } from '@b2b-catalog-platform/ui/content/notice';

/**
 * Why something on this screen cannot be changed here: an area handed to an
 * external system, said once at the top of what it explains. The lock is the
 * glyph the greyed fields under it carry. The margin is the caller's.
 */
@Component({
  selector: 'app-locked-note',
  imports: [Icon, Notice],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <p uiNotice tone="neutral" role="status">
      <span class="flex items-start gap-2.5">
        <ui-icon
          [glyph]="lockIcon"
          class="mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
        <span><ng-content /></span>
      </span>
    </p>
  `,
})
export class LockedNote {
  protected readonly lockIcon = lockIcon;
}
