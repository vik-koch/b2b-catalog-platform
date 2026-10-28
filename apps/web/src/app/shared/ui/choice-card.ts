import { Component, computed, input, output } from '@angular/core';
import { Radio } from './radio';

const card = `relative h-full rounded-lg border p-3 transition-colors
              has-[:focus-visible]:outline-1
              has-[:focus-visible]:outline-offset-2
              has-[:focus-visible]:outline-secondary`;

/**
 * The chosen card is tinted, which reads across a row where a border alone is
 * a hairline, and still answers a pointer; a disabled one is shown greyed.
 */
const states = {
  disabled: 'border-edge opacity-60',
  checked: `border-primary bg-surface-subtle
            hover:border-accent
            active:border-primary-press`,
  unchecked: `border-edge-strong
              hover:border-accent
              active:border-primary active:bg-surface-subtle-press`,
} as const;

/**
 * Above the overlay, so what is in it can be clicked, and only as wide as its
 * content, so a click beside a link still chooses the card.
 */
const content = 'relative ml-7 w-fit empty:hidden';

/** Clear of the description where there is one, close under the title where not. */
const contentGaps = {
  described: 'mt-3',
  bare: 'mt-1',
} as const;

/**
 * One option of a choice that deserves a sentence (how the goods arrive, how
 * they are paid for): a framed card with a title, a description, and room
 * under it for what the choice reveals. The radio stays real.
 *
 * The whole card is the hit area, as an overlay inside the label: a label
 * around the projected content would swallow clicks meant for a link in it.
 */
@Component({
  selector: 'app-choice-card',
  imports: [Radio],
  host: { class: 'block' },
  template: `
    <div [class]="cardClass()">
      <label class="flex items-start gap-3">
        <span
          class="absolute inset-0 rounded-lg"
          [class.cursor-pointer]="!disabled()"
        ></span>
        <!-- Centred on the title's 24px line, not on the block. -->
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
          <!-- The title stays put under a pointer: it names the option. -->
          <span class="block font-medium">
            {{ title() }}
          </span>
          @if (description()) {
            <span class="mt-1 block text-sm text-ink-subtle">
              {{ description() }}
            </span>
          }
        </span>
      </label>

      <div [class]="contentClass()"><ng-content /></div>
    </div>
  `,
})
export class ChoiceCard {
  /** The same on every card of one choice, so arrow keys walk them. */
  readonly name = input.required<string>();
  readonly value = input.required<string>();
  readonly checked = input(false);
  readonly disabled = input(false);
  readonly title = input.required<string>();
  readonly description = input<string>();

  readonly chosen = output<void>();

  protected readonly contentClass = computed(
    () =>
      `${content} ${contentGaps[this.description() ? 'described' : 'bare']}`,
  );

  protected readonly cardClass = computed(() => `${card} ${this.state()}`);

  private state(): string {
    if (this.disabled()) return states.disabled;
    if (this.checked()) return states.checked;
    return states.unchecked;
  }
}
