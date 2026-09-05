import { Directive } from '@angular/core';

/**
 * A link inside running content — the treatment that says "this word goes
 * somewhere" without the weight of a button.
 *
 * The rule under it is drawn in the border colour rather than the text's, so
 * it reads as a hairline under a coloured word instead of a second line of the
 * same colour; hover takes both to the accent. It applies to <a> and to a
 * <button> that reads as a link, because a control that opens a panel makes
 * the same promise as one that navigates.
 */
export const LINK_BASE =
  'cursor-pointer font-medium underline underline-offset-2';

/**
 * The colours of it. `warning` is the same link standing inside a sentence
 * that is already amber — the shortfall on a cart line — where a blue word
 * would read as unrelated to the thing it answers.
 */
export const LINK_TONES = {
  default:
    'text-primary decoration-primary/30 hover:text-accent hover:decoration-accent',
  warning: 'text-amber-700 decoration-amber-700/30 hover:decoration-amber-700',
} as const;

/**
 * The default tone as a directive, for the ordinary case.
 *
 *   <a appLink routerLink="…">{{ value }}</a>
 */
@Directive({
  selector: '[appLink]',
  host: {
    class:
      'cursor-pointer font-medium underline underline-offset-2 text-primary decoration-primary/30 hover:text-accent hover:decoration-accent',
  },
})
export class Link {}
