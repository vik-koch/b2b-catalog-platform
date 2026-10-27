import { computed, Directive, input } from '@angular/core';

/**
 * A link inside running content — the treatment that says "this word goes
 * somewhere" without the weight of a button.
 *
 * The rule under it is the text's colour at 30%, so it reads as a hairline
 * under a coloured word instead of a second line of the same weight; hover
 * takes both to the accent. It applies to <a> and to a
 * <button> that reads as a link, because a control that opens a panel makes
 * the same promise as one that navigates.
 */

/** `warning` for a link inside a sentence that is already amber. */
const tones = {
  default: `text-primary decoration-primary/30
            hover:text-accent hover:decoration-accent`,
  warning: 'text-warning decoration-warning/30 hover:decoration-warning',
} as const;

export type LinkTone = keyof typeof tones;

/**
 * The default tone as a directive, for the ordinary case.
 *
 *   <a appLink routerLink="…">{{ value }}</a>
 */
@Directive({
  selector: '[appLink]',
  host: { '[class]': 'classes()' },
})
export class Link {
  readonly tone = input<LinkTone>('default');

  protected readonly classes = computed(
    () =>
      `cursor-pointer font-medium underline underline-offset-2
       ${tones[this.tone()]}`,
  );
}
