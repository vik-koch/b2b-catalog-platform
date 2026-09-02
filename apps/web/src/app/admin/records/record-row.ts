import { Component, input } from '@angular/core';

/**
 * One record, drawn the way the admin grids draw a record on a phone: the one
 * control that acts on the whole row, then what it is with its classifying
 * fact pushed right, then whatever else is worth reading, then what is known
 * about it on the left of a last line with the things that can be done to it
 * on the right.
 *
 * The grids arrived at that shape for a list of orders on a 360px screen. It
 * turns out to be the shape of every short admin list too — the filterable
 * attributes, the attribute inventory, the customer tiers, the category tree,
 * a category's filter panel — none of which has enough columns to be a table
 * at any width. Those five had been spelled five different ways, and none of
 * them the way the grid beside them was spelled.
 *
 * So it is one shape at every width rather than two, and the glyphs are what
 * change: `IconButton` gives them a finger's width below `md` and a pointer's
 * above it, where they also gain the gap their padding no longer supplies.
 *
 * Frame and dividers belong to the caller: these lists are dropped on by the
 * CDK, and a wrapper between the drop list and its rows is a wrapper the drag
 * has to be taught about.
 */
@Component({
  selector: 'app-record-row',
  template: `
    <!-- A hair of right padding on every row: the last action button is flush
         against whatever encloses the list otherwise, and on a tinted or
         bordered row that reads as clipped. -->
    <div class="flex gap-3 pr-1">
      <!-- A picture, where the record has one. Its own column, so the three
           lines beside it stay a block rather than wrapping under it. -->
      <ng-content select="[recordLead]" />

      <div
        class="min-w-0 flex-1"
        [class]="compact() ? 'sm:flex sm:items-center sm:gap-3' : ''"
      >
        <!-- The control that acts on the whole row leads it — the checkbox
             that switches a filter on, the grip that moves a tier, the chevron
             that opens a key. At most one, and never one of the buttons: those
             live at the other end.

             Centres, not baselines, at this level: a glyph in a button has no
             baseline of its own, so a baseline-aligned control drops its whole
             height below the line and hangs the title off its foot. The name
             and the chip beside it keep their baselines in the box below.

             As tall as a control whether or not there is one, so a row with a
             grip and a row without measure the same — which is what lets the
             inventory's values sit under their key without the nested list
             stepping to a different rhythm. -->
        <div class="flex min-h-9 min-w-0 flex-1 items-center gap-3 md:min-h-6">
          <ng-content select="[recordControl]" />
          <div
            class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1"
          >
            <ng-content />
          </div>
          <ng-content select="[recordBadge]" />
        </div>

        <ng-content select="[recordBody]" />

        <!-- On a compact row this is the same line as the title from sm up:
             a record that is a name and a row of buttons has nothing to put on
             a second line, and an empty half-line down a long list is a lot of
             page to scroll past. -->
        <div
          class="flex items-center justify-between gap-3"
          [class]="compact() ? 'mt-1 sm:mt-0 sm:min-h-9' : 'mt-1'"
        >
          <div
            class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-subtle"
          >
            <ng-content select="[recordMeta]" />
          </div>
          <!-- Never squeezed: the buttons are the reason the row is listed, and
               a long name is the thing that wraps. -->
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
   * For a record that is a name and its buttons and nothing else — the category
   * tree. Below `sm` it still stacks, because a name and six touch-sized glyphs
   * do not share 360px; from `sm` up the two share one line, held to the height
   * of the buttons in it so every row in the list measures the same.
   */
  readonly compact = input(false);
}
