import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IconNote } from '@b2b-catalog-platform/ui/content/icon-note';
import { lockIcon } from '@b2b-catalog-platform/ui/icons/glyphs/lock';
import { Notice } from '@b2b-catalog-platform/ui/content/notice';

/** Why something here cannot be changed, said once above what it covers.
 * The margin is the caller's. */
@Component({
  selector: 'app-locked-note',
  imports: [IconNote, Notice],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <p uiNotice tone="neutral" role="status">
      <span uiIconNote [glyph]="lockIcon"><ng-content /></span>
    </p>
  `,
})
export class LockedNote {
  protected readonly lockIcon = lockIcon;
}
