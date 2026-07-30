import { Component, inject } from '@angular/core';
import { adminText } from '../config/admin-text';
import { LucideIcon } from '../ui/icons/lucide-icon';
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
  imports: [LucideIcon],
  template: `
    @if (editMode.isAdmin() && text(); as text) {
      <button
        type="button"
        class="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-lg transition-colors"
        [class]="
          editMode.enabled()
            ? 'bg-primary text-white hover:bg-primary/90'
            : 'border border-stone-300 bg-white text-ink hover:bg-stone-50'
        "
        [attr.aria-pressed]="editMode.enabled()"
        (click)="editMode.toggle()"
      >
        <app-lucide-icon name="pencil" class="h-4 w-4" />
        {{ editMode.enabled() ? text.editMode.disable : text.editMode.enable }}
      </button>
    }
  `,
})
export class EditModeToggle {
  protected readonly editMode = inject(EditModeService);
  protected readonly text = adminText;
}
