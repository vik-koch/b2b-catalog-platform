import {
  afterEveryRender,
  afterNextRender,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
} from '@angular/core';

/**
 * A text area as tall as what is written in it, from the first frame, never
 * below the floor the caller set (`rows`, the size's minimum).
 *
 * Measured after every render, because the value arrives from bindings as
 * often as from typing; comparing the value keeps a render that changed
 * nothing free of layout. Measured again when the field's own width changes,
 * since text that wraps to two lines in a wide column wraps to four in a
 * narrow one.
 *
 *   <textarea appInput appAutoGrow rows="1" [value]="note()"></textarea>
 */
@Directive({
  selector: 'textarea[appAutoGrow]',
  host: { '(input)': 'fit()' },
})
export class AutoGrow {
  private readonly el =
    inject<ElementRef<HTMLTextAreaElement>>(ElementRef).nativeElement;
  /** What was on screen, and how wide it was, when the height was last set. */
  private fitted: string | null = null;
  private width = 0;

  constructor() {
    afterEveryRender(() => {
      if (this.el.value !== this.fitted) this.fit();
    });

    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      // Absent in the test DOM, which lays nothing out.
      if (typeof ResizeObserver === 'undefined') return;
      // Width only: this directive sets the height, and answering its own
      // writes would loop.
      const observer = new ResizeObserver(() => {
        if (this.el.clientWidth === this.width) return;
        this.fit();
      });
      observer.observe(this.el);
      destroy.onDestroy(() => observer.disconnect());
    });
  }

  protected fit(): void {
    const el = this.el;
    // Released first: `scrollHeight` is the larger of the content and the
    // height last given, so a field cut back down would never shrink.
    el.style.height = 'auto';
    // `scrollHeight` leaves out the borders the border-box height includes.
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
    this.fitted = el.value;
    this.width = el.clientWidth;
  }
}
