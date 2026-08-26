import { Component, computed, input, output } from '@angular/core';
import { Radio } from './radio';

/**
 * One option of a choice big enough to deserve explaining: a framed card with
 * a title, a sentence saying what picking it means, and room underneath for
 * whatever the choice reveals — a link to the conditions, a list of offices.
 *
 * A card rather than a segment or a dropdown because these choices decide the
 * shape of the rest of the form. Checkout asks two of them (how the goods
 * arrive, how they are paid for), and both are worth a sentence each; a
 * dropdown has nowhere to put one.
 *
 * The radio is real and stays real — the group semantics, arrow-key navigation
 * and the focus ring all come from the platform, and `has-[:focus-visible]`
 * puts that ring on the card. The whole card is the hit area, laid over it as
 * an overlay inside the label rather than by making the card a label: a label
 * wrapping the projected content would swallow clicks meant for the link or
 * the office list inside it. Those sit above the overlay instead.
 */
@Component({
  selector: 'app-choice-card',
  imports: [Radio],
  host: { class: 'block' },
  template: `
    <div [class]="cardClass()">
      <label class="flex items-start gap-3">
        <!-- The overlay: the card's own hit area, and the reason the card is
             not itself a label. -->
        <span class="absolute inset-0 cursor-pointer rounded-lg"></span>
        <!-- Centred on the title's own line box, not on the block: the radio
             is 16px in the 24px line the title sets, so it sits 4px down. -->
        <input
          type="radio"
          appRadio
          class="mt-1"
          [name]="name()"
          [value]="value()"
          [checked]="checked()"
          [disabled]="disabled()"
          (change)="chosen.emit()"
        />
        <span class="min-w-0">
          <span class="block font-medium">{{ title() }}</span>
          @if (description()) {
            <span class="mt-1 block text-sm text-muted">
              {{ description() }}
            </span>
          }
        </span>
      </label>

      <!-- Above the overlay, so a link or a list in here is clickable. Indented
           to the title's own column: what a choice reveals belongs under what
           it says, not under its radio. -->
      <div class="relative mt-3 ml-7 empty:hidden"><ng-content /></div>
    </div>
  `,
})
export class ChoiceCard {
  /** The radio group this card belongs to — the same string on every card of
   * one choice, which is what makes the arrow keys walk them. */
  readonly name = input.required<string>();
  readonly value = input.required<string>();
  readonly checked = input(false);
  readonly disabled = input(false);
  readonly title = input.required<string>();
  readonly description = input<string>();

  readonly chosen = output<void>();

  protected readonly cardClass = computed(() => {
    // Selected deepens to primary the way a pressed button does; hover goes
    // outward to accent. The tint is what makes the choice readable at a
    // glance across a row of cards, where a border alone is a hairline.
    const state = this.checked()
      ? 'border-primary bg-stone-50'
      : 'border-border-strong hover:border-accent';
    return `relative h-full rounded-lg border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-secondary ${state}`;
  });
}
