import {
  Component,
  ElementRef,
  effect,
  input,
  linkedSignal,
  untracked,
  viewChild,
} from '@angular/core';
import { debounced } from '../debounced';
import { Input } from '../input';
import { injectGridNav } from './grid-nav';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { searchIcon } from '@b2b-catalog-platform/ui/icons/glyphs/search';
import { xIcon } from '@b2b-catalog-platform/ui/icons/glyphs/x';

/** One request per word for a fast typist; the storefront search waits as long. */
const SEARCH_DEBOUNCE_MS = 200;

/**
 * A grid's find-a-row box (FR-ADM-05): filters after a pause, no submit. The
 * query goes into the URL as a replaced entry, one per keystroke being no
 * history. It fills the column it is given; the wording is the caller's.
 */
@Component({
  selector: 'app-grid-search-field',
  imports: [Input, Icon],
  template: `
    <div class="relative w-full min-w-0 flex-1">
      <!-- A label for the field, not a control: muted, no pointer events. -->
      <app-icon
        [glyph]="searchIcon"
        class="pointer-events-none absolute top-1/2 left-2.5 size-4
               -translate-y-1/2 text-ink-subtle"
      />
      <input
        #input
        appInput
        type="search"
        autocomplete="off"
        [attr.maxlength]="maxLength() ?? null"
        [attr.aria-label]="searchLabel()"
        [placeholder]="searchPlaceholder()"
        [value]="value()"
        (input)="value.set($any($event.target).value)"
        (keydown.escape)="clear()"
        class="w-full pr-8 pl-9 text-sm
               [&::-webkit-search-cancel-button]:hidden"
      />
      @if (value()) {
        <button
          type="button"
          class="absolute top-1/2 right-1.5 flex -translate-y-1/2
                 cursor-pointer items-center rounded-full p-1 text-ink-subtle
                 hover:text-accent"
          [title]="clearLabel()"
          (click)="clear()"
        >
          <app-icon [glyph]="xIcon" class="size-4" />
          <span class="sr-only">{{ clearLabel() }}</span>
        </button>
      }
    </div>
  `,
})
export class GridSearchField {
  protected readonly searchIcon = searchIcon;
  protected readonly xIcon = xIcon;
  private readonly navigate = injectGridNav();
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('input');

  /** The query in the URL. */
  readonly query = input('');
  /** The longest query the list's API accepts. */
  readonly maxLength = input<number>();
  readonly searchLabel = input('');
  readonly searchPlaceholder = input('');
  readonly clearLabel = input('');

  /**
   * Seeded from the URL, not bound to it: re-reading what this field just wrote
   * would fight the cursor. A query changed elsewhere (a link, Back) still
   * takes over. "This field caused it" is the query it sent, not one matching
   * the text: letters typed mid-navigation would otherwise be swallowed.
   */
  protected readonly value = linkedSignal<string, string>({
    source: () => this.query(),
    computation: (query, previous) => {
      const own = this.sent.indexOf(query);
      if (own >= 0) {
        // Navigations land in order, so any sent before this one is overtaken.
        this.sent.splice(0, own + 1);
        if (previous) return previous.value;
      }
      return previous && query === previous.value.trim()
        ? previous.value
        : query;
    },
  });

  /** Queries this field navigated to that have not arrived back yet. */
  private readonly sent: string[] = [];

  private readonly settled = debounced(this.value, SEARCH_DEBOUNCE_MS);

  constructor() {
    effect(() => {
      const q = this.settled().trim();
      // Also runs on its own navigation and on arrival at a filtered URL:
      // navigating again would reset the page of a URL opened on page 3.
      if (untracked(this.value).trim() === untracked(this.query).trim()) return;
      this.sent.push(q);
      this.navigate({ searchTerm: q || null }, { replaceUrl: true });
    });
  }

  /** Empties the field and keeps focus for the next query. */
  protected clear(): void {
    this.value.set('');
    this.input()?.nativeElement.focus();
  }
}
