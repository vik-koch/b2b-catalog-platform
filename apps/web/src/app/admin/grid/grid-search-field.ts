import {
  Component,
  ElementRef,
  effect,
  input,
  linkedSignal,
  untracked,
  viewChild,
} from '@angular/core';
import { SEARCH_QUERY_MAX_LENGTH } from '@b2b-catalog-platform/shared';
import { debounced } from '../../core/debounced';
import { Input } from '../../ui/input';
import { injectGridNav } from './grid-query';
import { Icon } from '../../ui/icons/icon';

/** Long enough that a fast typist produces one request per word rather than one
 * per letter, short enough that a pause feels answered immediately. The same
 * number the storefront's search field uses. */
const SEARCH_DEBOUNCE_MS = 200;

/**
 * A grid's find-a-row box (FR-ADM-05): typing filters the table after a pause,
 * with no submit. The query goes into the URL like every other grid parameter —
 * so a filtered view is shareable — but as a *replaced* history entry, since one
 * back-button step per keystroke would make the back button useless.
 *
 * Deliberately a plain field, not the storefront's search bar with its submit
 * button and suggestion dropdown: this one filters a table already on screen and
 * must not out-shout the "Add" action beside it, nor cover the rows it produces.
 *
 * The wording is passed in rather than injected, so the same field serves any
 * admin grid — its labels are the caller's.
 *
 * It fills whatever column it is given rather than carrying a width of its own:
 * stacked on a phone that is the line, and from `md` up it is the wide middle
 * column of the heading. A fixed width left a phone with a field ending halfway
 * across the screen, and a desktop with one shrinking while the row beside it
 * had space to spare.
 */
@Component({
  selector: 'app-grid-search-field',
  imports: [Input, Icon],
  template: `
    <div class="relative w-full min-w-0 flex-1">
      <!-- Leading glyph: a label for the field rather than a control, so it is
           muted and takes no pointer events. -->
      <app-icon
        name="search"
        class="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-subtle"
      />
      <input
        #input
        appInput
        type="search"
        autocomplete="off"
        [maxLength]="maxLength"
        [attr.aria-label]="searchLabel()"
        [placeholder]="searchPlaceholder()"
        [value]="value()"
        (input)="value.set($any($event.target).value)"
        (keydown.escape)="clear()"
        class="w-full pr-8 pl-9 text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      @if (value()) {
        <button
          type="button"
          class="absolute top-1/2 right-1.5 flex -translate-y-1/2 cursor-pointer items-center rounded-full p-1 text-subtle hover:text-accent"
          [title]="clearLabel()"
          (click)="clear()"
        >
          <app-icon name="close" class="h-4 w-4" />
          <span class="sr-only">{{ clearLabel() }}</span>
        </button>
      }
    </div>
  `,
})
export class GridSearchField {
  private readonly navigate = injectGridNav();
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('input');
  protected readonly maxLength = SEARCH_QUERY_MAX_LENGTH;

  /** The query in the URL. */
  readonly query = input('');
  readonly searchLabel = input('');
  readonly searchPlaceholder = input('');
  readonly clearLabel = input('');

  /**
   * Seeded from the URL rather than bound to it: the field is the admin's to
   * edit between navigations, and re-reading the parameter this component just
   * wrote would fight the cursor. A query that changed elsewhere — a shared
   * link, the back button — still takes it back, while the navigation this
   * field itself caused leaves the typed text exactly as typed (trailing space
   * included, which the URL does not carry).
   */
  protected readonly value = linkedSignal<string, string>({
    source: () => this.query(),
    computation: (query, previous) =>
      previous && query === previous.value.trim() ? previous.value : query,
  });

  private readonly settled = debounced(this.value, SEARCH_DEBOUNCE_MS);

  constructor() {
    effect(() => {
      const q = this.settled().trim();
      // Guarded, because this effect also runs on the navigation it caused (and
      // on arrival at an already-filtered URL) — navigating again there would
      // be a redundant round trip, and would reset the page of a URL that was
      // just opened on page 3.
      if (untracked(this.value).trim() === untracked(this.query).trim()) return;
      this.navigate({ searchTerm: q || null }, { replaceUrl: true });
    });
  }

  /** Empties the field and hands focus back, so the next query can be typed
   * without reaching for the input again. */
  protected clear(): void {
    this.value.set('');
    this.input()?.nativeElement.focus();
  }
}
