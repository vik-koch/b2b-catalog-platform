import { Component, inject, input } from '@angular/core';
import { Glyph } from '@b2b-catalog-platform/ui/icons/glyph';
import { saveIcon } from '@b2b-catalog-platform/ui/icons/glyphs/save';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { SHARED_TEXT } from '../../shared/config/shared-text';

/**
 * An editor's save button: its glyph, and "Saving…" in place of the label
 * while it is disabled.
 *
 *   <button uiButton appSaveButton type="submit" [saving]="busy()">
 *     {{ adminText.actions.save }}
 *   </button>
 */
@Component({
  selector: 'button[appSaveButton]',
  imports: [Icon],
  host: { class: 'gap-2', '[disabled]': 'saving()' },
  template: `
    <ui-icon [glyph]="glyph()" class="size-4" />
    @if (saving()) {
      {{ savingText }}
    } @else {
      <ng-content />
    }
  `,
})
export class SaveButton {
  protected readonly savingText = inject(SHARED_TEXT).actions.saving;

  readonly saving = input.required<boolean>();
  readonly glyph = input<Glyph>(saveIcon);
}
