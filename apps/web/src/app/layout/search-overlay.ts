import { Component, computed, HostListener, inject } from '@angular/core';
import { APP_TEXT } from '../config/app-text';
import { Icon } from '../ui/icons/icon';
import { withExitAnimation } from './leave-animation';
import { MobileSearch } from './mobile-search';
import { SearchField } from './search-field';

/** Must match the exit animations in styles.css. */
const LEAVE_MS = 150;

/**
 * The search field over the page, below `sm` — what the bottom bar's search
 * tab opens once the header's own field has scrolled away.
 *
 * It is a surface rather than a bar: the page behind it is dimmed and held
 * still under it, so it is plain that the field is what is being answered and there is
 * nothing to lose by typing. The row is the height the header's is, and in the
 * same place, and it drops in from the top edge — so opening it reads as the
 * header being fetched back rather than as arriving somewhere new. It is also
 * where suggestions, and later the things a search screen can offer that a bar
 * cannot, have room to sit.
 *
 * It goes back the way it came, which is why what is rendered is not the open
 * state itself: an element the template has already removed has nothing left
 * to animate, so the row outlives the state by the length of its exit and
 * leaves under its own animation. Faster on the way out than in — a dismissal
 * is the direction where waiting is felt as lag.
 */
@Component({
  selector: 'app-search-overlay',
  imports: [Icon, SearchField],
  host: { class: 'sm:hidden' },
  template: `
    @if (shown()) {
      <div [class]="rowClasses()">
        <app-search-field class="min-w-0 flex-1" [autoFocus]="true" />
        <button
          type="button"
          class="-mr-2 inline-flex cursor-pointer items-center justify-center rounded-lg p-2 text-primary transition-colors hover:text-accent active:text-primary-deep"
          (click)="search.close()"
        >
          <app-icon name="close" class="h-6 w-6" />
          <span class="sr-only">{{ text.closeSearch }}</span>
        </button>
      </div>
      <!-- The dimmed page is also the way out: tapping it is a decision not to
           search. A button rather than a div with a handler, because that is
           what it is — and after the row in the document, so the caret and the
           tab order reach the field first while it still paints beneath.

           Above everything the page puts along its edges — the bottom bar, the
           consent banner, the admin edit-mode toggle — because all of them
           belong to the page that is being held still. -->
      <button type="button" [class]="scrimClasses()" (click)="search.close()">
        <span class="sr-only">{{ text.closeSearch }}</span>
      </button>
    }
  `,
})
export class SearchOverlay {
  protected readonly search = inject(MobileSearch);
  protected readonly text = inject(APP_TEXT).search;

  /** In the document while open, and for as long as it takes to leave. */
  private readonly exit = withExitAnimation(this.search.open, LEAVE_MS);
  protected readonly shown = this.exit.shown;
  private readonly leaving = this.exit.leaving;

  private readonly row =
    'fixed inset-x-0 top-0 z-60 flex h-15 items-center gap-2 border-b border-border bg-surface/85 backdrop-blur px-4 motion-reduce:animate-none';
  private readonly scrim =
    'fixed inset-0 z-50 cursor-default bg-black/40 backdrop-blur-[2px] motion-reduce:animate-none';

  protected readonly rowClasses = computed(
    () =>
      `${this.row} ${this.leaving() ? 'animate-search-lift' : 'animate-search-drop'}`,
  );
  protected readonly scrimClasses = computed(
    () =>
      `${this.scrim} ${this.leaving() ? 'animate-search-clear' : 'animate-search-dim'}`,
  );

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.search.close();
  }
}
