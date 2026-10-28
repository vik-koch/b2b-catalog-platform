import { Component, computed, input } from '@angular/core';

const base = `inline-flex h-5 w-5 items-center justify-center rounded-full
              select-none`;

/** How much attention the badge asks for. */
export type HintBadgeTone = 'neutral' | 'notice' | 'warning';

const tones: Record<HintBadgeTone, string> = {
  /** A fact about the row, no action implied. */
  neutral: 'bg-chip text-ink-subtle',
  /** Something the app does with this row: filterable, published, indexed. */
  notice: 'bg-chip text-accent-strong',
  /** Something the admin may want to look at, but nothing is refused. */
  warning: 'bg-warning-surface text-warning-ink',
};

/**
 * A small circled glyph that states something about its row, the sentence in
 * the tooltip: a remark for a dense table, where a line of text has nowhere to
 * go. Filled and round where icon controls are chromeless and square, so it
 * does not read as one more thing to click. The glyph is projected.
 *
 *   <app-hint-badge tone="warning" [label]="text.notNumeric">
 *     <app-icon [glyph]="triangleAlertIcon" class="h-3.5 w-3.5" />
 *   </app-hint-badge>
 */
@Component({
  selector: 'app-hint-badge',
  host: { class: 'inline-flex' },
  template: `
    <span
      role="img"
      [class]="classes()"
      [title]="label()"
      [attr.aria-label]="label()"
    >
      <ng-content />
    </span>
  `,
})
export class HintBadge {
  /** The whole remark: the tooltip and the accessible name. */
  readonly label = input.required<string>();
  readonly tone = input<HintBadgeTone>('neutral');

  protected readonly classes = computed(() => `${base} ${tones[this.tone()]}`);
}
