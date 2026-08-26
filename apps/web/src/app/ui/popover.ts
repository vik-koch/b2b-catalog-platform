import {
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * A small bubble anchored under the control it is about, with an arrow touching
 * it (owned primitive, like Button and Input).
 *
 * It is deliberately not a dialog: nothing here traps focus or blocks the page.
 * It says one thing about one control — a correction already made, a question
 * with two answers — and it goes away on the next click anywhere, on Escape, or
 * by itself where the caller gives it a duration.
 *
 * Place it inside a `relative` wrapper around the control it points at:
 *
 *   <div class="relative">
 *     <button …>−</button>
 *     @if (asking()) {
 *       <app-popover align="start" (dismissed)="stop()">…</app-popover>
 *     }
 *   </div>
 *
 * The host spans the anchor's width and the arrow sits at its centre, so the
 * arrow points at the control whatever the panel itself does — which is why a
 * bubble on a control at the right edge is aligned `end`: the panel hangs
 * inwards from the thing the arrow points at rather than off the card. An
 * anchor narrower than the panel's corner radius would put the arrow over that
 * corner, so a wrapper is given the control's own padding rather than being
 * pulled in tight around the glyph.
 *
 * Dismissal listens for `pointerdown`, not `click`. A bubble opened by a blur —
 * the quantity correction — is opened *during* the click that moved the focus,
 * and a click listener would be called by that same click and close it before
 * it was ever seen.
 */
@Component({
  selector: 'app-popover',
  host: { '[class]': 'hostClass()' },
  template: `
    <span [class]="arrowClass()"></span>
    <div [class]="panelClass()"><ng-content /></div>
  `,
})
export class Popover {
  /** Where the panel sits under the arrow: centred on the control, or starting
   * at its left edge — which is what keeps a bubble on a narrow control (a
   * stepper key) inside the card it belongs to. */
  readonly align = input<'center' | 'start' | 'end'>('center');
  /**
   * Which side of the anchor the bubble opens on. Below by default; above
   * where what sits underneath is the rest of the controls — a bubble a
   * customer has to dismiss before they can reach the button behind it is a
   * bubble in the way.
   */
  readonly placement = input<'below' | 'above'>('below');
  /** A bubble that holds a control rather than a sentence: wide enough to type
   * in, and its content reads from the left rather than being centred. */
  readonly roomy = input(false);
  /** Milliseconds after which it dismisses itself; 0 waits for the customer.
   * A statement can time out, a question may not. */
  readonly duration = input(0);
  readonly dismissed = output<void>();

  /** The host is the anchor's own box: it spans its width, so everything
   * inside is placed relative to the control the bubble is about. */
  protected readonly hostClass = computed(
    () =>
      `absolute left-0 z-20 block w-full ${
        this.placement() === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'
      }`,
  );

  protected readonly arrowClass = computed(() => {
    // The two bordered edges are the ones facing the anchor, so the arrow
    // reads as the panel's own corner drawn out to a point.
    const side =
      this.placement() === 'above'
        ? '-bottom-1.5 border-r border-b'
        : '-top-1.5 border-t border-l';
    // Centred on the anchor whatever the alignment: the arrow says which
    // control the bubble is about, and a bubble that pointed beside its own
    // button said it about nothing.
    return `absolute z-10 h-3 w-3 rotate-45 border-border-strong bg-white left-1/2 -translate-x-1/2 ${side}`;
  });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Shadowed well clear of the card's own edge: both are white, and a bubble
   * that reads as part of the card underneath it is not a bubble. */
  protected readonly panelClass = computed(() => {
    const align = this.align();
    const place =
      align === 'center'
        ? 'left-1/2 -translate-x-1/2'
        : align === 'end'
          ? 'right-0'
          : 'left-0';
    const vertical = this.placement() === 'above' ? 'bottom-0' : '';
    // A bubble holding a control is padded evenly: the field inside it stands
    // off the bubble's edge by as much below as it does at its sides, which a
    // tighter vertical padding did not. A sentence still gets the flatter box.
    const size = this.roomy()
      ? 'w-56 max-w-[calc(100vw-2rem)] p-3 text-left'
      : 'w-max max-w-52 px-3 py-2 text-center';
    return `absolute rounded-md border border-border-strong bg-white text-sm text-ink shadow-xl ${size} ${place} ${vertical}`;
  });

  private readonly onOutside = (event: Event) => {
    if (!this.host.nativeElement.contains(event.target as Node)) this.close();
  };
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') this.close();
  };

  constructor() {
    if (this.isBrowser) {
      document.addEventListener('pointerdown', this.onOutside);
      document.addEventListener('keydown', this.onKey);
    }
    // In an effect, not here: an input has no bound value yet at construction.
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
    });
  }

  private close(): void {
    this.dismissed.emit();
  }
}
