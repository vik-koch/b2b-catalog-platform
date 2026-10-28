import {
  Component,
  computed,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import { FieldBinding } from './field-binding';
import { injectCoarsePointer } from './coarse-pointer';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Input } from './input';
import { calendarIcon } from '@b2b-catalog-platform/ui/icons/glyphs/calendar';

/**
 * The engine's own affordance takes all three rules to hide: appearance-none
 * where it is drawn as part of the control, and the two pseudo-elements where
 * it is a child. The left padding is the calendar glyph's room.
 */
const base = `peer w-full appearance-none pl-9
              [&::-webkit-calendar-picker-indicator]:hidden
              [&::-webkit-inner-spin-button]:hidden`;

/**
 * The segment being typed in, in the focus colour rather than the OS blue.
 * Only WebKit exposes the segments; elsewhere this is inert.
 */
const segments =
  '[&::-webkit-datetime-edit-day-field:focus,&::-webkit-datetime-edit-month-field:focus,&::-webkit-datetime-edit-year-field:focus]:bg-secondary [&::-webkit-datetime-edit-day-field:focus,&::-webkit-datetime-edit-month-field:focus,&::-webkit-datetime-edit-year-field:focus]:text-white';

/**
 * An empty field hides the engine's own placeholder (different in every
 * engine, and nothing at all on iOS) so it can draw its own. Transparent text
 * is the one way that reaches every engine; WebKit's segments need telling
 * separately. While focused the segments show, quieter than a chosen date.
 */
const empty =
  'text-ink-subtle [&::-webkit-datetime-edit]:text-ink-subtle ' +
  '[&:not(:focus)]:text-transparent ' +
  '[&:not(:focus)::-webkit-datetime-edit]:text-transparent';

/** Under a finger the field is a button that opens the picker, and looks it. */
const tappable = 'cursor-pointer select-none';

/**
 * One native date input, drawn our way: the browser's picker is the one the
 * person knows, and it hands back an ISO day. This owns only the appearance:
 * a calendar glyph in place of the engine's affordance, a placeholder of its
 * own and the focus colour on the segments. The words around it are the
 * caller's.
 */
@Component({
  selector: 'app-date-field',
  imports: [FormField, FieldBinding, Icon, Input],
  host: { class: 'block' },
  template: `
    <!-- Under a mouse, a click types into the segment under it and the glyph
         opens the picker; opening it on every click made the field impossible
         to type in. Under a finger, a tap anywhere opens the picker: a segment
         is too small a target. The glyph is a pointer affordance only, so it
         is out of the tab order and unnamed. -->
    <div class="relative flex items-center">
      <button
        type="button"
        tabindex="-1"
        aria-hidden="true"
        class="absolute left-2 flex cursor-pointer items-center justify-center
               rounded-sm p-1 text-ink-subtle transition-colors
               hover:text-accent"
        (click)="openPicker(dateInput()?.nativeElement)"
      >
        <app-icon [glyph]="calendarIcon" class="size-4" />
      </button>
      @if (field(); as field) {
        <!-- Inside a Field, which gives it its id and ARIA wiring. -->
        <input
          #input
          type="date"
          [attr.min]="min()"
          [attr.max]="max()"
          appInput
          [class]="fieldClass()"
          [formField]="field"
          (click)="onFieldClick(input)"
        />
      } @else {
        <input
          #input
          [id]="fieldId()"
          type="date"
          [attr.min]="min()"
          [attr.max]="max()"
          [value]="value() ?? ''"
          appInput
          [class]="fieldClass()"
          (click)="onFieldClick(input)"
          (change)="picked($event)"
          [attr.aria-label]="ariaLabel() || null"
          [attr.aria-invalid]="invalid() || null"
          [attr.aria-describedby]="describedBy() || null"
        />
      }
      <!-- The placeholder, after the input so it can hide once the caret
           arrives. Decorative: the label names the field. -->
      @if (current() === null && placeholder()) {
        <span
          aria-hidden="true"
          class="pointer-events-none absolute left-9 text-ink-subtle
                 select-none
                 peer-focus:hidden"
        >
          {{ placeholder() }}
        </span>
      }
    </div>
  `,
})
export class DateField {
  protected readonly calendarIcon = calendarIcon;
  /** ISO `YYYY-MM-DD`, or null for no date at all. */
  readonly value = input<string | null>(null);
  /** Where a form holds the date; an empty string is no date. */
  readonly field = input<FieldTree<string>>();
  readonly fieldId = input<string>();
  /** What an empty field says. */
  readonly placeholder = input<string>();
  /**
   * Bounds the picker offers. Advisory: a date can still be typed, so whatever
   * refuses one says so itself.
   */
  readonly min = input<string>();
  readonly max = input<string>();
  readonly invalid = input(false);
  readonly describedBy = input<string>();
  /** Only where no `<label>` names the field. */
  readonly ariaLabel = input<string>();

  readonly valueChange = output<string | null>();

  private readonly coarse = injectCoarsePointer();
  /** Whichever of the two inputs is drawn, for the glyph outside them. */
  protected readonly dateInput =
    viewChild<ElementRef<HTMLInputElement>>('input');

  /** The date shown, whichever of the two holds it. */
  protected readonly current = computed(() => {
    const field = this.field();
    return field ? field().value() || null : this.value();
  });

  protected readonly fieldClass = computed(
    () =>
      `${base} ${segments} ${this.current() === null ? empty : ''}
       ${this.coarse() ? tappable : ''}`,
  );

  /** A tap opens the picker; a click does not — see the template. */
  protected onFieldClick(input: HTMLInputElement): void {
    if (this.coarse()) this.openPicker(input);
  }

  /**
   * Guarded: `showPicker` is absent on older engines and refuses outside a
   * user gesture, and the field still takes typing either way.
   */
  protected openPicker(input: HTMLInputElement | undefined): void {
    try {
      input?.showPicker?.();
    } catch {
      // Nothing to do: the date can still be typed.
    }
  }

  protected picked(event: Event): void {
    this.valueChange.emit((event.target as HTMLInputElement).value || null);
  }
}
