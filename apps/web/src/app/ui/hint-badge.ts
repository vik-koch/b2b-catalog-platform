import { Component, computed, input } from '@angular/core';

/** How much attention the badge asks for. */
export type HintBadgeTone = 'neutral' | 'notice' | 'warning';

const tones: Record<HintBadgeTone, string> = {
  /** A fact about the row, no action implied. */
  neutral: 'bg-stone-100 text-subtle',
  /** Something the shop does with this row — filterable, published, indexed. */
  notice: 'bg-stone-100 text-accent',
  /** Something the admin may want to look at, but nothing is refused. */
  warning: 'bg-amber-50 text-amber-700',
};

/**
 * A small circled icon that states something about the row it sits in, with the
 * sentence itself in the tooltip — for a remark that has to be visible in a
 * dense table where a line of text has nowhere to go.
 *
 * Deliberately not a button: it is filled and round where the app's icon
 * controls are square and chromeless, so it does not read as one more thing to
 * click. The icon is projected, so this stays in `ui/` without naming a glyph
 * from the admin-only icon set.
 *
 *   <app-hint-badge tone="warning" [label]="text.notNumeric">
 *     <app-admin-icon name="triangle-alert" class="h-3.5 w-3.5" />
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
  /** The whole remark — it is the tooltip and the accessible name. */
  readonly label = input.required<string>();
  readonly tone = input<HintBadgeTone>('neutral');

  protected readonly classes = computed(
    () =>
      `inline-flex h-5 w-5 items-center justify-center rounded-full ${tones[this.tone()]}`,
  );
}
