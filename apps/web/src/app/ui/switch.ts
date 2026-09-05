import { Component, input, output } from '@angular/core';

/**
 * An on/off switch — a native <button role="switch">, so the browser gives it
 * keyboard activation and screen readers announce the state rather than a verb.
 * For settings that take effect immediately; a control that only takes effect on
 * save belongs in a form with a checkbox instead.
 *
 * The label is never rendered: it is the accessible name, and the surrounding
 * block already says in words what the setting is and what state it is in.
 *
 *   <app-switch
 *     [checked]="enabled()"
 *     [label]="text.enable"
 *     (toggled)="save($event)"
 *   />
 */
@Component({
  selector: 'app-switch',
  // Without this the host stays an inline box and adds the line's descender
  // space around the control: it measures ~31px tall for a 24px switch, which
  // both breaks `items-center` against neighbouring text and makes the control
  // taller than any skeleton standing in for it.
  host: { class: 'inline-flex' },
  template: `
    <!-- On, the track is a fill and lightens to accent under a pointer like
         any other fill in the app. Off, it cannot: accent on an off switch
         reads as an on one, so the grey deepens instead — the same statement
         ("this is operable") in the only colour left that claims no state. -->
    <button
      type="button"
      role="switch"
      [attr.aria-checked]="checked()"
      [attr.aria-label]="label()"
      [disabled]="disabled()"
      class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors select-none disabled:cursor-not-allowed disabled:opacity-60"
      [class]="
        checked()
          ? 'bg-primary hover:bg-accent active:bg-primary-deep'
          : 'bg-border-strong hover:bg-stone-400 active:bg-stone-500'
      "
      (click)="toggled.emit(!checked())"
    >
      <!-- The knob. Transform only, so the travel never reflows anything. -->
      <span
        class="pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform"
        [class]="checked() ? 'translate-x-5' : 'translate-x-0'"
        aria-hidden="true"
      ></span>
    </button>
  `,
})
export class Switch {
  readonly checked = input.required<boolean>();
  /** Accessible name — say what the switch controls, e.g. "Maintenance mode". */
  readonly label = input.required<string>();
  readonly disabled = input(false);

  /** Emits the requested state, so the host owns whether it actually changes. */
  readonly toggled = output<boolean>();
}
