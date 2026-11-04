import {
  afterNextRender,
  booleanAttribute,
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
 * The floor for `height` pixels of content: whole rows and the hairlines
 * between them, never the height itself, so a grown row keeps the card's
 * rhythm. The half pixel is slack for sub-pixel text metrics.
 */
export function panelRowFloor(height: number): number {
  const rows = Math.max(
    1,
    Math.ceil((height - ROW - 0.5) / (ROW + HAIRLINE)) + 1,
  );
  return rows * ROW + (rows - 1) * HAIRLINE;
}

/**
 * One destination in a panel card, with what is worth saying about it on the
 * right, so a card's notes share one axis to read down. The link's overlay
 * makes the whole row the target; the right side sits above it, so a note stays
 * its own link.
 */
@Component({
  selector: 'app-panel-row',
  imports: [RouterLink],
  host: { class: 'block', role: 'listitem' },
  template: `
    <!-- The row measures what it holds and takes the floor: a wrapped label
         and two stacked badges are the same problem. -->
    <div
      #row
      class="group/row relative flex items-center justify-between gap-4 px-5
             py-1.75 transition-[min-height,background-color] duration-200
             ease-out
             hover:bg-surface-subtle-hover"
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
      <!-- Positioned, so it paints over the link's overlay. Badges wrap onto
           one line where there is room; notes stack, one sentence a line. Its
           width is the flex box's to share, never a fixed half. -->
      <div
        #slot
        class="relative flex justify-end"
        [class]="
          stacked()
            ? 'flex-col items-end gap-0.5'
            : 'flex-wrap items-center gap-x-2 gap-y-1'
        "
      >
        <ng-content />
      </div>
    </div>
  `,
})
export class PanelRow {
  readonly label = input.required<string>();
  readonly link = input.required<string | readonly unknown[]>();
  /** The row's own narrowing; a note carries its own. */
  readonly queryParams = input<Params>();
  /** One note under another, rather than wrapped badges. */
  readonly stacked = input(false, { transform: booleanAttribute });

  private readonly row = viewChild.required<ElementRef<HTMLElement>>('row');
  private readonly labelEl =
    viewChild.required<ElementRef<HTMLElement>>('labelEl');
  private readonly slot = viewChild.required<ElementRef<HTMLElement>>('slot');

  /** Animated: what grows a row arrives after the panel has painted. */
  protected readonly floor = signal(ROW);

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const row = this.row().nativeElement;
      const halves = [this.labelEl().nativeElement, this.slot().nativeElement];

      // The halves are centred, so the floor cannot feed back into them.
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
