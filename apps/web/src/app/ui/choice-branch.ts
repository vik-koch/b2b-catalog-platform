import { Component, computed, input, output } from '@angular/core';
import { Radio } from './radio';

/**
 * One option of a plain radio list, and — where it is the one chosen — a frame
 * around what it reveals.
 *
 * The frame is a real `<fieldset>` with the radio inside its `<legend>`, which
 * is what draws it the way it is drawn: the border starts at the radio, the
 * option's own words interrupt the top line, and the rule picks up again after
 * them. Nothing here positions anything — that shape is what a legend does to a
 * fieldset's border, and reproducing it with pseudo-elements would be a drawing
 * of a fieldset rather than one.
 *
 * It earns its place where a branch carries controls of its own: an address
 * being typed ends in "save this for next time", and without a frame that tick
 * box reads as belonging to the list rather than to the address above it.
 *
 * The element is the same whether the frame is drawn or not, so choosing an
 * option never rebuilds the radio underneath the cursor — the keyboard keeps
 * its place in the group.
 */
@Component({
  selector: 'app-choice-branch',
  imports: [Radio],
  host: { class: 'block' },
  template: `
    <!-- Presentational: the fieldset is here for the border its legend breaks,
         not to group anything. The option's own label already names the radio,
         and a group announced around every row of a list is noise. -->
    <fieldset role="presentation" [class]="frameClass()">
      <!-- Flush left and unpadded: the legend's own box is where the border
           breaks, so the option's words sit in the top line and the rule picks
           up again just past them. -->
      <legend class="ms-0 p-0" [class.pe-3]="framed()">
        <label class="flex cursor-pointer items-baseline gap-2">
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

      <!-- Indented to the option's own words rather than to its radio: what a
           choice reveals belongs under what it says. -->
      <div [class]="contentClass()"><ng-content /></div>
    </fieldset>
  `,
})
export class ChoiceBranch {
  /** The radio group this option belongs to. */
  readonly name = input.required<string>();
  readonly value = input.required<string>();
  readonly checked = input(false);
  /** Whether to draw the frame — this option is chosen *and* has revealed
   * something worth fencing off. An option that reveals nothing never does. */
  readonly framed = input(false);

  readonly chosen = output<void>();

  protected readonly frameClass = computed(() => {
    // The same box either way, so nothing shifts when the frame appears.
    if (!this.framed()) return 'rounded-md border border-transparent p-0';
    // Every edge but the left one is an ordinary border. The left is painted
    // as a background strip in the border's own 1px column, starting a radio's
    // height down: a fieldset draws that border from the legend's middle,
    // which is exactly where the radio is, and a rule through the control it
    // belongs to reads as a strike-through.
    return [
      'rounded-md border border-border border-l-transparent p-0',
      'bg-no-repeat bg-origin-border',
      'bg-[position:left_top] bg-[size:1px_100%]',
      'bg-[image:linear-gradient(to_bottom,transparent_0,transparent_1rem,var(--color-border)_1rem)]',
    ].join(' ');
  });

  /** Indented to the frame's own padding, the way a card's content is. */
  protected readonly contentClass = computed(() =>
    this.framed()
      ? 'empty:hidden pt-3 pr-4 pb-4 pl-4'
      : 'empty:hidden pt-3 pl-4',
  );
}
