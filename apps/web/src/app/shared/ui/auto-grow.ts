import {
  afterEveryRender,
  afterNextRender,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
} from '@angular/core';

/**
 * A text area that is as tall as what is written in it — from the first frame,
 * not from the first keystroke.
 *
 * Notes are the case this exists for. One is usually a line and occasionally
 * five, it is written once and re-read on every visit to the cart, and a field
 * that keeps a fixed height turns the long ones into a slot the customer has
 * to scroll to read back. Growing costs nothing while it is a line: the field
 * still starts at whatever floor the call site set (its `rows`, and the
 * minimum the size gives it), and never shrinks below it.
 *
 * Measured after every render rather than only on input, because the value
 * arrives from a binding as often as from the keyboard — a note written on the
 * product page, re-read on the cart, corrected by a preview. The guard is the
 * value itself, so the common render costs a string comparison and no layout.
 *
 * Measured again whenever the field's own width changes, which is the other
 * half of the same promise: the lines and the cart rearrange themselves as the
 * window moves, and a note that wrapped to two lines in a wide column wraps to
 * four in a narrow one. Watching the element rather than the window is what
 * catches the rearrangement the window never had — a filter panel appearing
 * beside the listing, the summary column arriving beside the cart.
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
      // Absent in the test DOM, which lays nothing out and so has no width to
      // report: the field is still fitted on every render there.
      if (typeof ResizeObserver === 'undefined') return;
      // Width only: the box is resized by this very directive, and answering
      // its own writes is how an observer becomes a loop.
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
    // Released first: `scrollHeight` is what the content needs *or* the height
    // it was last given, whichever is larger, so a field that has been typed
    // into and cut back down would never come back.
    el.style.height = 'auto';
    // The box is border-box, and `scrollHeight` is not: the borders have to be
    // added back or the field is two pixels short of its own text.
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
    this.fitted = el.value;
    this.width = el.clientWidth;
  }
}
