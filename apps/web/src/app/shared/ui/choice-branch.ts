import { Component, computed, input, output } from '@angular/core';
import { Radio } from './radio';

/** The same box either way, so nothing shifts when the frame appears. */
const frame = 'rounded-md border p-0';

const frames = {
  unframed: 'border-transparent',
  /**
   * Every edge but the left is a border. The left is a 1px background strip
   * that starts a radio's height down: a fieldset draws it from the legend's
   * middle, which is where the radio is, and a line through it reads as a
   * strike.
   */
  framed: `border-edge border-l-transparent bg-no-repeat bg-origin-border
           bg-[position:left_top] bg-[size:1px_100%]
           bg-[image:linear-gradient(to_bottom,transparent_0,transparent_1rem,var(--color-edge)_1rem)]`,
} as const;

/** Under the option's words rather than its radio. */
const content = 'empty:hidden pt-3 pl-4';

const contents = {
  unframed: '',
  framed: 'pr-4 pb-4',
} as const;

/**
 * One option of a radio list that, when chosen, frames what it reveals: a
 * real fieldset with the radio in its legend, so the option's words break the
 * frame's top line. For a branch with controls of its own, which would
 * otherwise read as belonging to the list. The element stays the same either
 * way, so choosing never rebuilds the radio under the cursor.
 */
@Component({
  selector: 'app-choice-branch',
  imports: [Radio],
  host: { class: 'block' },
  template: `
    <!-- Presentational: the fieldset is here for its border. The label names
         the radio, and a group around every row would be noise. -->
    <fieldset role="presentation" [class]="frameClass()">
      <legend class="ms-0 p-0" [class.pe-3]="framed()">
        <label
          class="flex cursor-pointer items-baseline gap-2 transition-colors
                 hover:text-accent"
        >
          <input
            type="radio"
            appRadio
            class="self-center"
            [name]="name()"
            [value]="value()"
            [checked]="checked()"
            (change)="chosen.emit()"
          />
          <span class="flex flex-wrap items-baseline gap-x-4">
            <ng-content select="[branchLabel]" />
          </span>
        </label>
      </legend>

      <div [class]="contentClass()"><ng-content /></div>
    </fieldset>
  `,
})
export class ChoiceBranch {
  readonly name = input.required<string>();
  readonly value = input.required<string>();
  readonly checked = input(false);
  /** Chosen, and revealing something worth fencing off. */
  readonly framed = input(false);

  readonly chosen = output<void>();

  private readonly look = computed(() =>
    this.framed() ? 'framed' : 'unframed',
  );

  protected readonly frameClass = computed(
    () => `${frame} ${frames[this.look()]}`,
  );

  protected readonly contentClass = computed(
    () => `${content} ${contents[this.look()]}`,
  );
}
