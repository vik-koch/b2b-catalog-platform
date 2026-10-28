import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  PLATFORM_ID,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** How close to the window's edge the panel may come before it is nudged in. */
const EDGE_MARGIN_PX = 8;

const hostBase = 'absolute left-0 z-20 block w-full';

const arrowBase = `absolute left-1/2 z-10 h-3 w-3 -translate-x-1/2 rotate-45
                   border-edge-strong bg-white`;

/** Shadowed well clear of a white card, so it does not read as part of it. */
const panelBase = `absolute rounded-md border border-edge-strong bg-white
                   text-sm text-ink shadow-xl`;

const aligns = {
  center: 'left-1/2 -translate-x-1/2',
  start: 'left-0',
  end: 'right-0',
} as const;

/**
 * Per side of the anchor: where the host sits, which edges of the arrow are
 * drawn (those facing the anchor, so it reads as the panel's corner drawn
 * out), and where the panel hangs.
 */
const placements = {
  below: {
    host: 'top-full mt-2',
    arrow: '-top-1.5 border-t border-l',
    panel: '',
  },
  above: {
    host: 'bottom-full mb-2',
    arrow: '-bottom-1.5 border-r border-b',
    panel: 'bottom-0',
  },
} as const;

/**
 * One max-width each, as `min()`: two utilities, a cap and a viewport one,
 * were decided by stylesheet order rather than by which is smaller. A bubble
 * holding a control is padded evenly and reads from the left.
 */
const sizes = {
  sentence: 'w-max max-w-[min(13rem,calc(100vw-2rem))] px-3 py-2 text-center',
  roomy: 'w-56 max-w-[calc(100vw-2rem)] p-3 text-left',
  wide: 'w-[36rem] max-w-[calc(100vw-2rem)] p-3 text-left',
} as const;

/**
 * A small bubble anchored to the control it is about, with an arrow touching
 * it. Not a dialog: it traps nothing, and goes away on the next pointer press
 * anywhere, on Escape, or after a duration. Place it in a `relative` wrapper
 * around the control:
 *
 *   <div class="relative">
 *     <button …>−</button>
 *     @if (asking()) {
 *       <ui-popover align="start" (dismissed)="stop()">…</ui-popover>
 *     }
 *   </div>
 *
 * The host spans the anchor's width and the arrow sits at its centre, so the
 * arrow points at the control whatever the panel does; a control near the
 * right edge takes `end`, so the panel hangs inwards.
 *
 * Dismissal listens for `pointerdown`, not `click`: a bubble opened by a blur
 * is opened during the click that moved the focus, which would close it.
 */
@Component({
  selector: 'ui-popover',
  host: { '[class]': 'hostClass()' },
  template: `
    <span [class]="arrowClass()"></span>
    <!-- The panel's nudge is written by fit(), not bound: see there. -->
    <div #panel [class]="panelClass()">
      <ng-content />
    </div>
  `,
})
export class Popover {
  /** Centred on the control, or hanging from its start or end edge. */
  readonly align = input<keyof typeof aligns>('center');
  /** Above where what lies below is the rest of the controls. */
  readonly placement = input<keyof typeof placements>('below');
  /** Holds a control rather than a sentence: wide enough to type in. */
  readonly roomy = input(false);
  /** Holds pictures, which need the width. */
  readonly wide = input(false);
  /** Milliseconds until it dismisses itself; 0 waits. A question never times out. */
  readonly duration = input(0);
  readonly dismissed = output<void>();

  protected readonly hostClass = computed(
    () => `${hostBase} ${this.side().host}`,
  );

  protected readonly arrowClass = computed(
    () => `${arrowBase} ${this.side().arrow}`,
  );

  protected readonly panelClass = computed(
    () =>
      `${panelBase} ${sizes[this.size()]} ${aligns[this.align()]}
       ${this.side().panel}`,
  );

  private readonly side = computed(() => placements[this.placement()]);

  private readonly size = computed((): keyof typeof sizes => {
    if (this.wide()) return 'wide';
    if (this.roomy()) return 'roomy';
    return 'sentence';
  });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  private readonly onOutside = (event: Event) => {
    if (!this.host.nativeElement.contains(event.target as Node)) this.close();
  };
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') this.close();
  };

  /** How far the panel has been nudged sideways to stay on screen. */
  private shift = 0;

  /**
   * Pulls the panel back inside the page in the frame it was drawn in. Written
   * to the element, not through a signal: a signal paints one frame first, and
   * a phone widens its layout viewport for that frame's overflow and does not
   * shrink it back, so fixed bars stretch and the page scrolls sideways.
   * `transform`, not `translate`, which the alignment classes own. Only the
   * panel moves; the arrow keeps pointing at the control.
   */
  private readonly fit = () => {
    const panel = this.panel().nativeElement;
    const rect = panel.getBoundingClientRect();
    // The page's width: `innerWidth` counts the scrollbar.
    const width = document.documentElement.clientWidth;
    // Measured with the shift applied, so a second pass changes nothing.
    const overhangRight = rect.right - (width - EDGE_MARGIN_PX);
    const overhangLeft = EDGE_MARGIN_PX - rect.left;
    const by = this.nudge(overhangRight, overhangLeft);
    if (by === 0) return;
    this.shift += by;
    panel.style.transform = `translateX(${this.shift}px)`;
  };

  constructor() {
    if (this.isBrowser) {
      afterNextRender(() => this.fit());
      window.addEventListener('resize', this.fit);
      document.addEventListener('pointerdown', this.onOutside);
      document.addEventListener('keydown', this.onKey);
    }
    // In an effect: an input has no bound value yet at construction.
    effect((onCleanup) => {
      const ms = this.duration();
      if (ms <= 0) return;
      const timer = setTimeout(() => this.close(), ms);
      onCleanup(() => clearTimeout(timer));
    });
    inject(DestroyRef).onDestroy(() => {
      if (!this.isBrowser) return;
      document.removeEventListener('pointerdown', this.onOutside);
      document.removeEventListener('keydown', this.onKey);
      window.removeEventListener('resize', this.fit);
    });
  }

  private nudge(overhangRight: number, overhangLeft: number): number {
    if (overhangRight > 0) return -overhangRight;
    if (overhangLeft > 0) return overhangLeft;
    return 0;
  }

  private close(): void {
    this.dismissed.emit();
  }
}
