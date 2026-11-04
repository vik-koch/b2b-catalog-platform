import { Component, inject } from '@angular/core';
import { adminText } from '../../platform/config/admin-text';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { EditModeService } from '../../platform/edit-mode/edit-mode.service';
import { pencilIcon } from '@b2b-catalog-platform/ui/icons/glyphs/pencil';

/**
 * The admin's floating edit-mode toggle (FR-ADM-01), only on a page with
 * something to edit. Mounted before the admin text loads, so it reads it as a
 * signal. A zero-height sticky host between page and footer rides the viewport
 * and comes to rest on the seam; the `+1rem` in both offsets is half the pill,
 * which straddles it. Below the panels, cookie notice and modals.
 */
@Component({
  selector: 'app-edit-mode-toggle',
  imports: [Icon],
  // The host sticks: a wrapper of its own height would pin it in place.
  host: {
    class: `sticky bottom-[calc(4.25rem+1px+1rem+env(safe-area-inset-bottom))]
            z-20 block h-0
            sm:bottom-[calc(1.375rem+1rem)]`,
  },
  template: `
    @if (editMode.isAdmin() && editMode.hasEditables() && text(); as text) {
      <button
        type="button"
        class="absolute right-4 bottom-0 flex translate-y-1/2 cursor-pointer
               items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium
               shadow-lg transition-colors"
        [class]="
          editMode.enabled()
            ? 'bg-accent text-white hover:border-accent hover:bg-white hover:text-ink active:bg-primary-press active:text-white'
            : 'bg-white text-ink hover:text-accent active:text-primary-press'
        "
        [attr.aria-pressed]="editMode.enabled()"
        (click)="editMode.toggle()"
      >
        <ui-icon [glyph]="pencilIcon" class="size-4" />
        {{ editMode.enabled() ? text.editMode.disable : text.editMode.enable }}
      </button>
    }
  `,
})
export class EditModeToggle {
  protected readonly pencilIcon = pencilIcon;
  protected readonly editMode = inject(EditModeService);
  protected readonly text = adminText;
}
