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
 * arrow points at the control however the panel itself is aligned.
 *
 * Dismissal listens for `pointerdown`, not `click`. A bubble opened by a blur —
 * the quantity correction — is opened *during* the click that moved the focus,
 * and a click listener would be called by that same click and close it before
 * it was ever seen.
 */
@Component({
  selector: 'app-popover',
  host: { class: 'absolute top-full left-0 z-20 mt-2 block w-full' },
  template: `
    <span
      class="absolute -top-1.5 left-1/2 z-10 h-3 w-3 -translate-x-1/2 rotate-45 border-t border-l border-border-strong bg-white"
    ></span>
    <div [class]="panelClass()"><ng-content /></div>
  `,
})
export class Popover {
  /** Where the panel sits under the arrow: centred on the control, or starting
   * at its left edge — which is what keeps a bubble on a narrow control (a
   * stepper key) inside the card it belongs to. */
  readonly align = input<'center' | 'start'>('center');
  /** Milliseconds after which it dismisses itself; 0 waits for the customer.
   * A statement can time out, a question may not. */
  readonly duration = input(0);
  readonly dismissed = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Shadowed well clear of the card's own edge: both are white, and a bubble
   * that reads as part of the card underneath it is not a bubble. */
  protected readonly panelClass = computed(
    () =>
      `absolute w-max max-w-52 rounded-md border border-border-strong bg-white px-3 py-2 text-center text-sm text-ink shadow-xl ${
        this.align() === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0'
      }`,
  );

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
