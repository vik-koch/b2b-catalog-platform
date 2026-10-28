import { computed, Directive, inject, input } from '@angular/core';
import { FileTarget } from './file-target';

const base = `flex cursor-pointer flex-col items-center justify-center
              rounded-md border-1 border-dashed border-edge-strong bg-white
              text-center text-ink-subtle transition-colors
              disabled:cursor-not-allowed disabled:opacity-50`;

/** Only a file over it fills it; one already holding something stops inviting. */
const states = {
  dragging: 'border-primary bg-primary/5 text-accent',
  filled: '',
  empty: 'hover:border-accent hover:text-accent',
} as const;

/**
 * The dashed area a file goes into, on the element that takes it; whether a
 * file is over it is read from the FileTarget on the same element. The size
 * is the caller's.
 *
 *   <button uiDropZone [uiFileTarget]="accept" class="h-26 w-26">…</button>
 */
@Directive({
  selector: '[uiDropZone]',
  host: { '[class]': 'classes()' },
})
export class DropZone {
  private readonly target = inject(FileTarget, { self: true, optional: true });

  readonly filled = input(false);

  protected readonly classes = computed(() => `${base} ${this.state()}`);

  private state(): string {
    if (this.target?.dragging()) return states.dragging;
    if (this.filled()) return states.filled;
    return states.empty;
  }
}
