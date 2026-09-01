import { Component, inject } from '@angular/core';
import { adminText } from '../config/admin-text';
import { Icon } from '../ui/icons/icon';
import { EditModeService } from './edit-mode.service';

/**
 * A floating, admin-only toggle for storefront edit mode (FR-ADM-01). Renders
 * nothing for anyone who is not a signed-in admin, so the public bundle carries
 * only an empty instance. It is mounted on every route, before any admin text
 * has been fetched, so it reads that text as a signal rather than injecting it.
 * Reachable from anywhere on a page that has something to edit, and drawn on
 * no other page — see EditModeService.hasEditables.
 *
 * It floats in the corner but stops at the footer rather than over it, which
 * is what the sticky host does: a zero-height box standing in the document
 * exactly between the page and the footer, it rides the bottom of the viewport
 * for as long as the page scrolls and comes to rest on that seam once the
 * reader reaches the end, the button straddling the line rather than covering
 * the footer's own links.
 *
 * Straddling costs the one number here: the button is pulled down by half its
 * own height, so both floating offsets carry a `+1rem` that puts it back where
 * it was while it floats. That rem is half the pill — if its padding or type
 * size change, it changes with them.
 *
 * Between the two rather than inside <main>, which is what makes the resting
 * place exact and unmeasured: inside, the box would stand at the end of the
 * page's *content* and park a bottom padding short of the seam it is aiming
 * at, and the padding would have to be spelled out here to cancel it. Sticky
 * only ever pulls an element up towards the viewport, never past where the
 * document puts it, so the seam is both its home and its floor.
 */
@Component({
  selector: 'app-edit-mode-toggle',
  imports: [Icon],
  // The sticky box is the host itself, not something inside it: a sticky
  // element travels only within its own containing block, so a wrapper of its
  // own height would pin it in place. Zero height, so the line it stands for
  // is the seam itself and it adds nothing to either side of it.
  host: {
    class:
      'sticky bottom-[calc(4.25rem+1px+1rem+env(safe-area-inset-bottom))] z-40 block h-0 sm:bottom-[calc(1.375rem+1rem)]',
  },
  template: `
    @if (editMode.isAdmin() && editMode.hasEditables() && text(); as text) {
      <button
        type="button"
        class="absolute right-4 bottom-0 flex translate-y-1/2 cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium shadow-lg transition-colors"
        [class]="
          editMode.enabled()
            ? 'bg-accent text-white hover:border-accent hover:bg-white hover:text-black active:bg-primary-deep active:text-white'
            : 'bg-white text-ink hover:text-accent active:text-primary-deep'
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
