import { Component, computed, input } from '@angular/core';

/**
 * One record of a short list, at every width: the control acting on the whole
 * row, the title with a badge pushed right, body lines, then meta on the left
 * of the last line and actions on the right. Slots: `recordLead` (a picture
 * column), `recordControl`, default (title and chips), `recordBadge`,
 * `recordBody`, `recordMeta`, `recordActions`.
 *
 * Frame and dividers are the caller's: a CDK drop list must hold its rows
 * directly.
 */
@Component({
  selector: 'ui-record-row',
  template: `
    <!-- pr-1: a last button flush with a tinted or bordered row looks clipped. -->
    <div class="flex items-center gap-3 pr-1">
      <!-- Its own column, centred: the lines beside it stay one block. -->
      <ng-content select="[recordLead]" />

      <div
        class="min-w-0 flex-1"
        [class]="compact() ? 'sm:flex sm:items-center sm:gap-3' : ''"
      >
        <!-- Centred, not baseline: a glyph in a button has no baseline and
             would drop below the line. As tall as a control with or without
             one, so nested lists keep the same rhythm. -->
        <div class="flex min-h-6 min-w-0 flex-1 items-center gap-3">
          <ng-content select="[recordControl]" />
          <div
            class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1"
          >
            <ng-content />
          </div>
          <ng-content select="[recordBadge]" />
        </div>

        <ng-content select="[recordBody]" />

        <div
          class="flex items-center justify-between gap-3 mt-0 sm:mt-1"
          [class]="compact() ? 'sm:min-h-8' : null"
        >
          <div [class]="metaClass()">
            <ng-content select="[recordMeta]" />
          </div>
          <!-- Never squeezed: the title is what wraps. -->
          <div class="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <ng-content select="[recordActions]" />
          </div>
        </div>
      </div>
    </div>
  `,
})
export class RecordRow {
  /**
   * Title and actions on one line from `sm` up, for a record that is a name and
   * its buttons. Below `sm` it stacks: touch-sized glyphs do not fit beside it.
   */
  readonly compact = input(false);

  /** Meta lines stacked rather than strung along one line: for meta that is
   * sentences, which run together when wrapped. */
  readonly stackMeta = input(false);

  protected readonly metaClass = computed(() =>
    this.stackMeta()
      ? 'flex min-w-0 flex-col items-start gap-y-0.5 text-sm text-ink-subtle'
      : `flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm
         text-ink-subtle`,
  );
}
