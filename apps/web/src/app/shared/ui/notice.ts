import { computed, Directive, input } from '@angular/core';

const base = 'block rounded-md border p-3 text-sm';

/**
 * A notice is its tone's text on its tone's ground, inside its tone's line
 * (docs/design-language.md): one rule, so a notice reads the same whichever
 * page it stops the reader on. Only the tones a notice is drawn in.
 */
const tones = {
  danger: 'border-danger-edge bg-danger-surface text-danger-ink',
  warning: 'border-warning-edge bg-warning-surface text-warning-ink',
  info: 'border-info-edge bg-info-surface text-info-ink',
} as const;

export type NoticeTone = keyof typeof tones;

/**
 * A panel that stops the reader before what follows it: a step to confirm,
 * something that failed, something not saved. The page keeps the element, its
 * role or label, and the space around it.
 *
 *   <p appNotice tone="warning" role="status" class="mb-4">…</p>
 */
@Directive({
  selector: '[appNotice]',
  host: { '[class]': 'classes()' },
})
export class Notice {
  readonly tone = input.required<NoticeTone>();

  protected readonly classes = computed(() => `${base} ${tones[this.tone()]}`);
}
