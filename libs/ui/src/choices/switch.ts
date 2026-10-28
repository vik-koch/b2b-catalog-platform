import { Component, computed, input, output } from '@angular/core';

const track = `relative inline-flex h-6 w-11 shrink-0 cursor-pointer
               rounded-full transition-[background-color,box-shadow]
               select-none
               disabled:cursor-not-allowed disabled:opacity-60`;

/**
 * Off, the track is drawn as an unticked checkbox is, a pale ground in an edge,
 * and it is the edge that answers a pointer: an accent fill would read as on.
 */
const tracks = {
  on: 'bg-primary hover:bg-accent active:bg-primary-press',
  off: `bg-surface-strong ring-1 ring-edge-strong
        hover:bg-accent hover:ring-accent
        active:ring-primary`,
} as const;

/** The knob moves by transform only, so its travel reflows nothing. */
const knob = `pointer-events-none absolute top-0.5 left-0.5 size-5
              rounded-full bg-white shadow-sm ring-1 ring-black/5
              transition-transform`;

const knobs = {
  on: 'translate-x-5',
  off: 'translate-x-0',
} as const;

/**
 * An on/off switch for a setting that takes effect at once: a native
 * <button role="switch">, so keyboard and screen readers get a state rather
 * than a verb. A choice that waits for a save is a checkbox in a form. The
 * label is only the accessible name; the words around it say the rest.
 *
 *   <ui-switch [checked]="enabled()" [label]="text.enable" (toggled)="save($event)" />
 */
@Component({
  selector: 'ui-switch',
  // As an inline box it took the line's descender space: 31px for a 24px switch.
  host: { class: 'inline-flex' },
  template: `
    <button
      type="button"
      role="switch"
      [attr.aria-checked]="checked()"
      [attr.aria-label]="label()"
      [disabled]="disabled()"
      [class]="trackClass()"
      (click)="toggled.emit(!checked())"
    >
      <span [class]="knobClass()" aria-hidden="true"></span>
    </button>
  `,
})
export class Switch {
  readonly checked = input.required<boolean>();
  /** The accessible name: what the switch controls, e.g. "Maintenance mode". */
  readonly label = input.required<string>();
  readonly disabled = input(false);

  /** The requested state; the host decides whether it changes. */
  readonly toggled = output<boolean>();

  private readonly state = computed(() => (this.checked() ? 'on' : 'off'));

  protected readonly trackClass = computed(
    () => `${track} ${tracks[this.state()]}`,
  );

  protected readonly knobClass = computed(
    () => `${knob} ${knobs[this.state()]}`,
  );
}
