import {
  Component,
  computed,
  forwardRef,
  input,
  output,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * The look of a segmented choice — several mutually exclusive options side by
 * side in one pill, rather than a dropdown or a column of radios.
 *
 * Most callers want `Segmented` below rather than these classes. They are
 * exported for the two pills that are not a row of labels and cannot be one:
 * the buying block, whose unsold units are buttons carrying a popover that
 * says why, and the listing's layout toggle, a pressed-button group of icons.
 * Both are the same pill and have to stay looking like it.
 */
const SEGMENT_BASE =
  'rounded text-center transition-colors has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-secondary';

/**
 * The pill around the segments, sized to its content.
 *
 * Its `rounded-lg` and its `p-1` are what fix the segment's own `rounded`:
 * concentric corners want the inner radius to be the outer one less the gap
 * between them, and 0.5rem − 0.25rem is 0.25rem. A larger inner radius leaves
 * the two curves visibly out of step.
 */
export const SEGMENTED_GROUP =
  'inline-flex gap-1 rounded-lg border border-border-strong bg-white p-1';

/** What a segment is: the chosen one, one that can be chosen, or one the
 * product is not sold in — shown rather than hidden, so every card offers the
 * same three units in the same places, and saying why is the segment's job. */
export type SegmentState = 'selected' | 'available' | 'unavailable';

/**
 * How big a segment is drawn. `sm` is a control that sits inside something
 * else — the unit selector on a card, the layout toggle in a listing header.
 * `md` is a pill standing among form fields, which has to read as one of them.
 */
export type SegmentSize = 'sm' | 'md';

const SIZES: Record<SegmentSize, string> = {
  sm: 'px-2 py-0.5 text-sm',
  md: 'px-4 py-1.5 text-sm font-medium',
};

export interface SegmentOptions {
  size?: SegmentSize;
  /**
   * Let the segment take its share of a full-width group: `flex-auto` rather
   * than `flex-1`, so segments divide the row in proportion to their labels.
   * Equal thirds only look right in the one language the labels were written
   * in.
   */
  grow?: boolean;
  /**
   * A group where nothing can be chosen at all — a line the shop no longer
   * offers. It keeps the reading (which unit the figure beside it is in) and
   * drops every affordance: no pointer, no hover, nothing to press.
   */
  locked?: boolean;
}

export function segmentClass(
  state: SegmentState,
  { size = 'sm', grow = false, locked = false }: SegmentOptions = {},
): string {
  const states: Record<SegmentState, string> = {
    selected: 'bg-primary text-white active:bg-primary-deep',
    available: 'text-ink hover:bg-stone-100 active:bg-stone-200',
    unavailable: 'text-stone-400 hover:bg-stone-50 active:bg-stone-100',
  };
  const lockedStates: Record<SegmentState, string> = {
    selected: 'bg-stone-400 text-white',
    available: 'text-stone-400',
    unavailable: 'text-stone-400',
  };
  const look = locked
    ? `cursor-not-allowed ${lockedStates[state]}`
    : `cursor-pointer ${states[state]}`;
  return `${SEGMENT_BASE} ${SIZES[size]} ${look}${grow ? ' flex-auto' : ''}`;
}

/** Radio names have to be unique per group: two pills on one page sharing a
 * name would be one group, and picking in either would clear the other. */
let nextGroup = 0;

/** One choice in a segmented pill. */
export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A segmented choice, as a component: a row of options in one pill, exactly
 * one chosen.
 *
 * It serves both ways a choice is held in this app. Where the pill is a field
 * on a form it is a `ControlValueAccessor`, so `formControlName` binds it like
 * any input. Where the choice lives in a signal — the checkout's party rows,
 * which redraw the fields under the pill — the caller binds `value` and hears
 * `chosen`. Whichever is in use, the segment classes and the radio semantics
 * come from one place.
 *
 * The radios stay real radios, hidden rather than replaced: arrow-key
 * navigation, the group semantics and the focus ring all come from the
 * platform, and `has-[:focus-visible]` puts that ring on the segment.
 */
@Component({
  selector: 'app-segmented',
  host: { class: 'inline-block' },
  template: `
    <div role="radiogroup" [attr.aria-label]="ariaLabel()" [class]="group">
      @for (option of options(); track option.value) {
        <label [class]="segment(option.value)">
          <input
            type="radio"
            class="sr-only"
            [name]="name()"
            [value]="option.value"
            [checked]="option.value === chosenValue()"
            [disabled]="disabled()"
            (change)="choose(option.value)"
            (blur)="markTouched()"
          />
          {{ option.label }}
        </label>
      }
    </div>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => Segmented),
      multi: true,
    },
  ],
})
export class Segmented<T extends string> implements ControlValueAccessor {
  protected readonly group = SEGMENTED_GROUP;

  /** The radio group's name. Unique per instance unless the caller names it:
   * two pills sharing a name would be one group, and picking in either would
   * clear the other. */
  readonly name = input(`segmented-${nextGroup++}`);

  readonly options = input.required<readonly SegmentOption<T>[]>();
  readonly size = input<SegmentSize>('sm');
  /** Only where the pill has no `legend` naming it. */
  readonly ariaLabel = input<string>();

  /** What is chosen, for a caller holding it in a signal. Left alone where a
   * form control is writing through the value accessor instead. */
  readonly value = input<T | null>(null);
  /** A segment was picked. The caller decides what that means — this does not
   * assume the choice took. */
  readonly chosen = output<T>();

  /** What a form control last wrote, used only when nobody binds `value`. */
  private readonly written = signal<T | null>(null);
  protected readonly disabled = signal(false);
  protected readonly chosenValue = computed(
    () => this.value() ?? this.written(),
  );

  protected segment(value: T): string {
    return segmentClass(
      value === this.chosenValue() ? 'selected' : 'available',
      {
        size: this.size(),
      },
    );
  }

  protected choose(value: T): void {
    this.written.set(value);
    this.onChange(value);
    this.chosen.emit(value);
  }

  protected markTouched(): void {
    this.onTouched();
  }

  private onChange: (value: T | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: T | null): void {
    this.written.set(value);
  }

  registerOnChange(fn: (value: T | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
