import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Params, RouterLink } from '@angular/router';

/** One row of the panel's grid, and the hairline that divides two of them. */
const ROW = 48;
const HAIRLINE = 1;

/**
 * The floor a row needs to hold `height` pixels of content: one row, or two,
 * or three — never the height itself. A card whose rows are 48px apart except
 * for the one that grew by 14px reads as a mistake, so a row that outgrows its
 * floor takes the next whole row *and the hairline that would have divided
 * them*.
 *
 * The half-pixel is slack against sub-pixel text metrics, which would
 * otherwise push a row that fits exactly onto a second one.
 */
export function panelRowFloor(height: number): number {
  const rows = Math.max(
    1,
    Math.ceil((height - ROW - 0.5) / (ROW + HAIRLINE)) + 1,
  );
  return rows * ROW + (rows - 1) * HAIRLINE;
}

/**
 * One destination in a panel card: what it is on the left, and whatever is
 * worth saying about it on the right — the count waiting there, when the
 * import last ran, the switch that turns it on.
 *
 * A row rather than a button in a wrapped group, and that is the whole point:
 * the panel is a list of places to go, and a list of places reads down. Laid
 * out as buttons, each card's remark sat under whichever button it belonged
 * to, so half a dozen amber lines landed at half a dozen different heights and
 * none of them could be scanned for. As rows they share one right-hand axis
 * per card, and "what is waiting" is one column to read down instead of a
 * search.
 *
 * The whole row is the hit area — the link stretches over it with a
 * pseudo-element, the way the choice card's overlay does — and what sits on
 * the right is above that, so a work note stays its own link into its own
 * narrowed list.
 */
@Component({
  selector: 'app-panel-row',
  imports: [RouterLink],
  // A row in a card is an item in that card's list — the cards are named
  // lists, since several of these labels ("About us") also appear in the site
  // header and a screen reader moving through the page needs to tell one from
  // the other.
  host: { class: 'block', role: 'listitem' },
  template: `
    <!-- A floor rather than a fixed height, and it rises by a whole row at a
         time — 48, then 48 + 48 + the hairline between them — so a card that
         has to grow keeps the same rhythm as the cards beside it rather than
         sitting 14px out of step with them. The row measures what it is
         holding and picks the step: a label that wrapped and a stack of two
         badges are the same problem, and the caller could only ever answer for
         one of them. -->
    <div
      #row
      class="group/row relative flex items-center justify-between gap-4 px-5 py-1.75 transition-[min-height,background-color] duration-200 ease-out hover:bg-stone-100"
      [style.min-height.px]="floor()"
    >
      <a
        #labelEl
        [routerLink]="link()"
        [queryParams]="queryParams()"
        class="after:absolute after:inset-0 group-hover/row:text-accent"
      >
        {{ label() }}
      </a>
      <!-- Positioned, so it paints over the link's overlay rather than under
           it: what is on the right is often a link of its own. A flex box, so
           what it holds centres against the row rather than sitting on the
           row's baseline.
           It wraps rather than stacking: two badges belong on one line
           wherever the row is wide enough for them, and reading down is a
           shape a narrow row falls into, not one to impose on a wide one.
           What it may claim is left to the flex box rather than capped at half
           the row: both halves give up width in proportion to what they asked
           for, and the label keeps its longest word whatever happens. A fixed
           half squeezed a one-word label's slot for no reason and wrapped a
           work note's sentence on a phone. -->
      <div
        #slot
        class="relative flex flex-wrap items-center justify-end gap-x-2 gap-y-1"
      >
        <ng-content />
      </div>
    </div>
  `,
})
export class PanelRow {
  readonly label = input.required<string>();
  readonly link = input.required<string | readonly unknown[]>();
  /** Where the row's own destination needs narrowing — not the note's, which
   * carries its own. */
  readonly queryParams = input<Params>();

  private readonly row = viewChild.required<ElementRef<HTMLElement>>('row');
  private readonly labelEl =
    viewChild.required<ElementRef<HTMLElement>>('labelEl');
  private readonly slot = viewChild.required<ElementRef<HTMLElement>>('slot');

  /**
   * The floor this row is currently on. It animates because what makes a row
   * grow — a switch being on, a label wrapping as the column narrows — arrives
   * after the panel has painted, and a card that resizes under the cursor
   * without moving is easier to read than one that jumps.
   */
  protected readonly floor = signal(ROW);

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const row = this.row().nativeElement;
      const halves = [this.labelEl().nativeElement, this.slot().nativeElement];

      // Both halves are centred against the row, so neither is stretched by
      // the floor this sets — measuring them cannot feed back into itself the
      // way measuring the row would.
      const measure = () => {
        const style = getComputedStyle(row);
        const padding =
          parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        const content = Math.max(
          ...halves.map((half) => half.getBoundingClientRect().height),
        );
        this.floor.set(panelRowFloor(content + padding));
      };

      const observer = new ResizeObserver(measure);
      for (const half of halves) observer.observe(half);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
