import { computed, Directive, input } from '@angular/core';

const base = 'cursor-pointer font-medium underline underline-offset-2';

/** `warning` for a link inside a sentence that is already amber. */
const tones = {
  default: `text-primary decoration-primary/30
            hover:text-accent hover:decoration-accent`,
  warning: 'text-warning decoration-warning/30 hover:decoration-warning',
} as const;

export type LinkTone = keyof typeof tones;

/**
 * A link inside running content, on any element that reads as one: a
 * coloured word with a hairline under it, the text's colour at 30%.
 *
 *   <a appLink routerLink="…">{{ value }}</a>
 *   <button type="button" appLink tone="warning" (click)="…">…</button>
 */
@Directive({
  selector: '[appLink]',
  host: { '[class]': 'classes()' },
})
export class Link {
  readonly tone = input<LinkTone>('default');

  protected readonly classes = computed(() => `${base} ${tones[this.tone()]}`);
}
