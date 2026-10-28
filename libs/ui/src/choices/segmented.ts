import { Component, input, model, output } from '@angular/core';
import { type FormValueControl } from '@angular/forms/signals';
import { Segment, type SegmentSize } from './segment';
import { SegmentGroup } from './segment-group';

/** Unique per instance: two pills sharing a name would be one radio group. */
let nextGroup = 0;

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A row of radios in one pill, exactly one chosen. Binds as a form control
 * (`[formField]`) or through `[(value)]`. The radios stay real, only hidden,
 * so arrow keys, group semantics and the focus ring are the platform's.
 */
@Component({
  selector: 'ui-segmented',
  imports: [SegmentGroup, Segment],
  host: { class: 'inline-block' },
  template: `
    <div uiSegmentGroup role="radiogroup" [attr.aria-label]="ariaLabel()">
      @for (option of options(); track option.value) {
        <!-- Disabled, the segments take the locked look: the radios are
             hidden, so their own disabled styling reaches nothing visible. -->
        <label
          uiSegment
          [state]="option.value === value() ? 'selected' : 'available'"
          [size]="size()"
          [locked]="disabled()"
        >
          <input
            type="radio"
            class="sr-only"
            [name]="name()"
            [value]="option.value"
            [checked]="option.value === value()"
            [disabled]="disabled()"
            (change)="value.set(option.value)"
            (blur)="touch.emit()"
          />
          {{ option.label }}
        </label>
      }
    </div>
  `,
})
export class Segmented<T extends string> implements FormValueControl<T> {
  readonly name = input(`segmented-${nextGroup++}`);

  readonly options = input.required<readonly SegmentOption<T>[]>();
  readonly size = input<SegmentSize>('sm');
  /** Only where no legend names the pill. */
  readonly ariaLabel = input<string>();

  readonly value = model.required<T>();
  readonly disabled = input(false);
  readonly touch = output<void>();
}
