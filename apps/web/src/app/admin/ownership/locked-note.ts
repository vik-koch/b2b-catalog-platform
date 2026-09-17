import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AdminIcon } from '../../ui/icons/admin-icon';

/**
 * Why something on this screen cannot be changed here — an area handed to an
 * external system (FR-ADM-10), said once at the top of the thing it explains.
 *
 * One component because it was three treatments: the catalog editors framed it
 * in a border, the account screens left it flat, and a fourth would have been
 * invented for the next screen that needed one. Flat and quiet is the right
 * one: it explains a state, it does not ask for anything, and a box around it
 * reads as a warning it is not.
 *
 * The lock repeats the word the rest of the panel uses for this — the greyed
 * fields under it, the switch on the operations page — so the banner is
 * recognisable before it is read.
 *
 * The margin belongs to the caller: `class="mb-6"` on the tag. The host is a
 * block so that lands where it is meant to.
 */
@Component({
  selector: 'app-locked-note',
  imports: [AdminIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <p
      class="flex max-w-3xl items-start gap-2.5 rounded-md bg-stone-100 px-4 py-3 text-sm text-muted"
      role="status"
    >
      <app-admin-icon
        name="lock"
        class="mt-0.5 h-4 w-4 shrink-0 text-subtle"
        aria-hidden="true"
      />
      <span><ng-content /></span>
    </p>
  `,
})
export class LockedNote {}
