import { Component, computed, input, output } from '@angular/core';
import { injectCoarsePointer } from '../core/coarse-pointer';
import { Icon } from './icons/icon';
import { Input } from './input';

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
 * The app's date field: one native date input, drawn our way.
 *
 * A native input rather than a calendar of our own — the browser's picker is
 * the one the person already knows, it hands back an ISO day with nothing to
 * parse, and on a phone it is the platform's wheel. What this owns is only the
 * appearance: our calendar glyph in place of the engine's affordance (drawn
 * differently in every browser and pinned to the right edge, where no other
 * field in the app keeps its own), our placeholder over an empty control, and
 * our focus colour on the segments.
 *
 * It carries no label and no hint: a customer's preferred delivery date and an
 * admin's certificate expiry are the same control saying entirely different
 * things around it, so the words stay with the caller.
 */
@Component({
  selector: 'app-date-field',
  imports: [Icon, Input],
  host: { class: 'block' },
  template: `
    <!-- Under a mouse there are two ways in, and they are different gestures.
         The field is typed into: a click lands a caret in the segment under
         it, and the segments take digits, as they do in any date input. The
         glyph is the other way — the picker, opened deliberately rather than
         by every click on the control, which is what used to make the field
         impossible to type in: the overlay came up before the caret ever
         landed.

         Under a finger there is one way in, and it is the picker. A day/month/
         year segment is a 2mm target that needs a keyboard nobody has, and the
         platform's own wheel is both the better control and the one already
         known — so on a touch screen a tap anywhere in the field opens it and
         the segments are not text to be dragged across.

         The glyph is a pointer affordance and nothing else, so it is out of
         the tab order and unnamed: a keyboard is already typing the date, and
         a second stop that only opens a picker is a stop with nothing behind
         it.

         Hiding the engine's own affordance takes all three rules:
         appearance-none for the engines that draw it as part of the control
         (Chrome on Android draws a chevron there), and the two pseudo-elements
         for those that make it a child. Each is inert where it does not
         apply. -->
    <div class="relative flex items-center">
      <button
        type="button"
        tabindex="-1"
        aria-hidden="true"
        class="absolute left-2 flex cursor-pointer items-center justify-center rounded p-1 text-subtle transition-colors hover:text-accent"
        (click)="openPicker(input)"
      >
        <app-icon name="calendar" class="h-4 w-4" />
      </button>
      <input
        #input
        [id]="fieldId()"
        type="date"
        [attr.min]="min()"
        [attr.max]="max()"
        [value]="value() ?? ''"
        appInput
        class="peer w-full appearance-none pl-9 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden"
        [class]="fieldClass()"
        (click)="onFieldClick(input)"
        (change)="picked($event)"
        [attr.aria-label]="ariaLabel() || null"
        [attr.aria-invalid]="invalid() || null"
        [attr.aria-describedby]="describedBy() || null"
      />
      <!-- Our own empty state, over the field the engine has been made to
           draw nothing in. After the input so it can watch it: it goes away
           the moment the caret arrives, which is when the segments underneath
           become the thing to read. Decorative — the label names the field. -->
      @if (value() === null && placeholder()) {
        <span
          aria-hidden="true"
          class="pointer-events-none absolute left-9 text-subtle select-none peer-focus:hidden"
        >
          {{ placeholder() }}
        </span>
      }
    </div>
  `,
})
export class DateField {
  /** ISO `YYYY-MM-DD`, or null for no date at all. */
  readonly value = input.required<string | null>();
  readonly fieldId = input<string>();
  /** What an empty field says, since a native one says something different in
   * every engine. */
  readonly placeholder = input<string>();
  /** Bounds the picker offers. Advisory: a native picker still lets a date be
   * typed, so whatever refuses one says so itself. */
  readonly min = input<string>();
  readonly max = input<string>();
  readonly invalid = input(false);
  readonly describedBy = input<string>();
  /** Only where no `<label>` names the field. */
  readonly ariaLabel = input<string>();

  readonly valueChange = output<string | null>();

  private readonly coarse = injectCoarsePointer();

  protected readonly fieldClass = computed(() => {
    const state = this.value() === null ? `${segments} ${empty}` : segments;
    // Under a finger the field is a button that opens the picker, and says so:
    // a caret it will not keep, and a text selection it cannot act on, are
    // both promises the tap is about to break.
    return this.coarse() ? `${state} cursor-pointer select-none` : state;
  });

  /** A tap opens the picker; a click does not — see the template. */
  protected onFieldClick(input: HTMLInputElement): void {
    if (this.coarse()) this.openPicker(input);
  }

  /** Opens the native picker from the glyph, in place of the engine's own
   * affordance, which is drawn differently in every browser. Guarded:
   * `showPicker` is absent on older engines and refuses outside a user
   * gesture, and the field still takes typing either way. */
  protected openPicker(input: HTMLInputElement): void {
    try {
      input.showPicker?.();
    } catch {
      // Nothing to do: the date can still be typed.
    }
  }

  protected picked(event: Event): void {
    this.valueChange.emit((event.target as HTMLInputElement).value || null);
  }
}
