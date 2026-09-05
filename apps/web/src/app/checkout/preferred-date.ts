import { Component, computed, inject, input, output } from '@angular/core';
import {
  firstOrderDate,
  FulfilmentMethod,
  localToday,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { FieldLabel } from '../ui/field-label';
import { Icon } from '../ui/icons/icon';
import { Input } from '../ui/input';

/*
 * The day/month/year segments a date is typed into, which only the WebKit
 * engines expose. Held here rather than in the template because the selector
 * list is longer than the rule it carries.
 *
 * The segment being typed in is highlighted in our own focused colour, in
 * place of the OS blue that matches nothing else on the page. Inert elsewhere —
 * a segment that highlights the platform's way is still a working field.
 */
const segments =
  '[&::-webkit-datetime-edit-day-field:focus,&::-webkit-datetime-edit-month-field:focus,&::-webkit-datetime-edit-year-field:focus]:bg-secondary [&::-webkit-datetime-edit-day-field:focus,&::-webkit-datetime-edit-month-field:focus,&::-webkit-datetime-edit-year-field:focus]:text-white';

/**
 * What an empty field wears, so that it can say something of its own.
 *
 * A native date input takes no `placeholder`, and what it draws instead is a
 * different thing in every engine: "dd.mm.yyyy" on a desktop, and on iOS an
 * empty box with nothing in it at all. So the field draws its own text over
 * the control and takes the engine's away — by making the text transparent,
 * which is the one way that reaches every engine (only WebKit exposes the
 * segments as a pseudo-element, and it needs telling separately because its
 * own colour does not inherit).
 *
 * Only while the field is *not* focused. Once the caret is in it the segments
 * are what is being typed into and have to be visible — in the meta colour a
 * half-entered date deserves, rather than at the full strength that reads as a
 * date somebody chose.
 */
const empty =
  'text-subtle [&::-webkit-datetime-edit]:text-subtle ' +
  '[&:not(:focus)]:text-transparent ' +
  '[&:not(:focus)::-webkit-datetime-edit]:text-transparent';

/**
 * When the customer would like the order (FR-CART-07) — a wish, not a booking.
 * Scheduling is settled between customer and manager, so this is a date beside
 * the order rather than a window anything reserves — which "preferred" in the
 * label already says.
 *
 * A native date field: it is one date, the browser's own picker is the one the
 * customer already knows, and it hands back an ISO day with no parsing of what
 * anybody typed. Optional throughout — an order with no date is the ordinary
 * case, meaning "whenever suits you".
 *
 * The days on offer are the ones the shop could work on (`order-dates`):
 * nothing today or earlier, and no weekend. The floor is measured from the
 * browser's own day, which is the one the customer is reading the field in.
 *
 * `min` alone does not cover it — a native picker greys out what falls before
 * the floor and offers every Saturday after it — so the rule is also said in
 * words under the field and checked when a date arrives. The message replaces
 * the hint rather than joining it: both say the same rule, and one of them is
 * about the date that is actually in the field.
 */
@Component({
  selector: 'app-preferred-date',
  imports: [FieldLabel, Icon, Input],
  host: { class: 'block' },
  template: `
    <label [for]="id" appFieldLabel>
      {{ method() === 'pickup' ? text.pickupLabel : text.deliveryLabel }}
      <span class="font-normal text-subtle">({{ optional }})</span>
    </label>
    <!-- A click anywhere in the field opens the picker, so the field is not
         really typed into even though it can be: select-none and the pointer
         say so, in place of a caret dragging across segments that the picker
         is about to cover anyway. It stays a real date input — the keyboard
         still edits it, which is what a customer who cannot use a picker
         needs.

         Our glyph replaces the browser's, rather than sitting beside it: the
         native button is drawn differently in every engine and pinned to the
         right edge, where no other field in the app keeps its affordance.
         Hidden, not removed — the control is still a real date input, and
         clicking anywhere in it opens the same picker.

         It takes all three: appearance-none for the engines that draw the
         affordance as part of the control itself (Chrome on Android draws a
         chevron there), and the two pseudo-elements for those that make it a
         child. Each is inert where it does not apply. -->
    <div class="relative flex max-w-46 items-center">
      <app-icon
        name="calendar"
        class="pointer-events-none absolute left-3 h-4 w-4 text-subtle"
      />
      <input
        [id]="id"
        type="date"
        [min]="floor"
        [value]="date() ?? ''"
        appInput
        class="peer w-full cursor-pointer appearance-none pl-9 select-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden"
        [class]="fieldClass()"
        (click)="openPicker($event)"
        (change)="picked($event)"
        [attr.aria-invalid]="invalid() || null"
        [attr.aria-describedby]="id + '-hint'"
      />
    </div>
    <p
      [id]="id + '-hint'"
      class="mt-1 text-sm"
      [class]="invalid() ? 'text-red-600' : 'text-muted'"
    >
      {{
        invalid()
          ? text.unavailable
          : method() === 'pickup'
            ? text.pickupHint
            : text.deliveryHint
      }}
    </p>
  `,
})
export class PreferredDate {
  protected readonly text = inject(APP_TEXT).checkout.timing;
  protected readonly optional = inject(APP_TEXT).checkout.optional;
  protected readonly id = 'preferred-date';

  /** Only what the label is called: a delivery is brought, a pickup collected. */
  readonly method = input.required<FulfilmentMethod>();
  /** ISO `YYYY-MM-DD`, or null for no date at all. */
  readonly date = input.required<string | null>();
  /** Whether the date in the field is one the shop does not offer — the page's
   * answer, since it is what refuses the submission over it. */
  readonly invalid = input(false);

  readonly dateChange = output<string | null>();

  /** The earliest day on offer, from the customer's own today. Read once: a
   * checkout open across midnight is not worth a ticking clock. */
  protected readonly floor = firstOrderDate(localToday());

  protected readonly fieldClass = computed(() =>
    this.date() === null ? `${segments} ${empty}` : segments,
  );

  /** Opens the native picker from a click anywhere in the field, since the
   * button that would have done it is hidden. Guarded: `showPicker` is absent
   * on older engines and refuses outside a user gesture, and a field that
   * still takes typing is a working field either way. */
  protected openPicker(event: Event): void {
    const input = event.target as HTMLInputElement;
    try {
      input.showPicker?.();
    } catch {
      // Nothing to do: the date can still be typed.
    }
  }

  protected picked(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.dateChange.emit(value || null);
  }
}
