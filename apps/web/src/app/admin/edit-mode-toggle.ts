import { Component, inject } from '@angular/core';
import { adminText } from '../config/admin-text';
import { Icon } from '../ui/icons/icon';
import { EditModeService } from './edit-mode.service';

/**
 * A floating, admin-only toggle for storefront edit mode (FR-ADM-01). Renders
 * nothing for anyone who is not a signed-in admin, so the public bundle carries
 * only an empty instance. It is mounted on every route, before any admin text
 * has been fetched, so it reads that text as a signal rather than injecting it.
 * Fixed to the corner so it is reachable from any catalog page while browsing
 * as the admin.
 */
@Component({
  selector: 'app-edit-mode-toggle',
  imports: [Icon],
  template: `
    @if (editMode.isAdmin() && text(); as text) {
      <button
        type="button"
        class="fixed right-4 bottom-[calc(4.25rem+1px+env(safe-area-inset-bottom))] z-40 sm:bottom-5.5 flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-lg transition-colors cursor-pointer"
        [class]="
          editMode.enabled()
            ? 'bg-accent text-white hover:border-accent hover:bg-white hover:text-black'
            : 'bg-white text-ink hover:text-accent'
        "
        [attr.aria-pressed]="editMode.enabled()"
        (click)="editMode.toggle()"
      >
        <app-icon name="pencil" class="h-4 w-4" />
        {{ editMode.enabled() ? text.editMode.disable : text.editMode.enable }}
      </button>
    }
  `,
})
export class EditModeToggle {
  protected readonly editMode = inject(EditModeService);
  protected readonly text = adminText;
}
