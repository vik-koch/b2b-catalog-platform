import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  PLATFORM_ID,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  SEARCH_QUERY_MAX_LENGTH,
  SearchSuggestion,
} from '@b2b-catalog-platform/shared';
import { CatalogService } from '../catalog/catalog.service';
import { APP_TEXT } from '../config/app-text';
import { currentUrl } from '../core/current-url';
import { debounced } from '../core/debounced';
import { matchSegments } from './match-segments';
import { Icon } from '../ui/icons/icon';

/** Long enough that a fast typist produces one request per word rather than
 * one per letter, short enough that a pause feels answered immediately. */
const SUGGEST_DEBOUNCE_MS = 200;

/** Ids have to be unique per instance: the header renders this field twice —
 * inline on desktop, inside the panel on mobile — and `aria-controls` pointing
 * at a duplicated id would name the wrong list. */
let nextId = 0;

/**
 * The search field itself (FR-SEARCH-01) — a real `<form>` around a real
 * `search` input, so Enter submits and the control degrades to a working search
 * box without JavaScript. Submitting navigates to `/search?q=…`.
 *
 * With JavaScript it is also a combobox (FR-SEARCH-05): typing offers a short
 * list of matching product names, and picking one goes straight to that
 * product. Suggestions are an accelerator layered on top and never become the
 * only way through — which is why the form underneath is untouched, and why
 * Enter still submits the typed query whenever no suggestion is selected.
 */
@Component({
  selector: 'app-search-field',
  imports: [Icon],
  host: { class: 'block' },
  template: `
    <!-- action and method are what make the no-JS path real rather than
         nominal: a form without them submits to the *current* URL, so the
         search box on the home page would navigate to /?q=… and drop the
         visitor back where they started. With JavaScript the submit handler
         preempts this and the router does the navigating instead. -->
    <form
      role="search"
      action="/search"
      method="get"
      [attr.aria-label]="text.searchNav"
      (submit)="submit($event)"
    >
      <!-- Field and button are two boxes butted together, not one. The edge
           between them is a single line — the button's left border, the field
           having none on that side — and it belongs to whichever control is
           lit: the field's hover and focus reach across through peer-*, and
           the button's own hover takes it back. Either highlight therefore
           closes around its control instead of stopping short of the seam.
           Both stretch to the row's height, which keeps them the same size. -->
      <div class="flex items-stretch">
        <!-- Also the positioning context for the dropdown, which hangs off the
             field rather than off the whole row: it lines up with the text
             being typed, not with the submit button. The border lives on the
             wrapper, not the input, so the leading glyph sits inside it. -->
        <div
          class="peer relative flex min-w-0 flex-1 items-center rounded-l-md border-2 border-r-0 border-primary bg-white hover:border-accent focus-within:border-secondary"
        >
          <!-- Leading glyph: a label for the field rather than a control, so it
               is muted and takes no pointer events. -->
          <app-icon
            name="search"
            class="pointer-events-none absolute left-2.5 h-4 w-4 text-subtle"
          />
          <input
            #input
            type="search"
            name="q"
            enterkeyhint="search"
            autocomplete="off"
            role="combobox"
            aria-autocomplete="list"
            [attr.aria-expanded]="panelOpen()"
            [attr.aria-controls]="listId"
            [attr.aria-activedescendant]="activeOptionId()"
            [maxLength]="maxLength"
            [attr.aria-label]="text.placeholder"
            [placeholder]="text.placeholder"
            [value]="value()"
            (input)="type($any($event.target).value)"
            (keydown)="keydown($event)"
            (blur)="close()"
            class="min-w-0 flex-1 bg-transparent py-2 pr-1 pl-9 text-sm text-stone-800 placeholder:text-subtle focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          @if (value()) {
            <!-- flex on the button itself, not just on its row: the icon is an
                 inline element otherwise, and would sit on the text baseline
                 rather than on the field's centre line. -->
            <button
              type="button"
              class="mr-1 flex shrink-0 cursor-pointer items-center justify-center rounded-full p-1.5 text-subtle transition-colors hover:text-accent"
              (click)="clear()"
            >
              <app-icon name="close" class="h-4 w-4" />
              <span class="sr-only">{{ text.clear }}</span>
            </button>
          }

          <!-- Kept in the DOM and hidden rather than removed: the element
               aria-controls names should not vanish from under the input
               between queries. The message is a sibling of the listbox, not a
               row inside it — a listbox may only contain options, and
               "nothing found" is not something to pick. -->
          <div
            [class.hidden]="!panelOpen()"
            class="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-md border border-border-strong bg-white py-1 shadow-lg"
          >
            @if (noMatches()) {
              <p class="px-3 py-2 text-sm text-subtle">
                {{ text.noSuggestions }}
              </p>
            }
            <ul
              [id]="listId"
              role="listbox"
              [attr.aria-label]="text.suggestionsLabel"
            >
              @for (item of suggestions(); track item.slug; let i = $index) {
                <li
                  [id]="listId + '-' + i"
                  role="option"
                  [attr.aria-selected]="i === activeIndex()"
                  class="cursor-pointer truncate px-3 py-2 text-sm text-stone-800"
                  [class.bg-stone-100]="i === activeIndex()"
                  (mouseenter)="activeIndex.set(i)"
                  (mousedown)="pick($event, item.slug)"
                >
                  <!-- The matched run is emboldened in place, as segments rather
                     than as markup — see match-segments.ts. Weight only: a
                     bolded fragment of a name is a visual cue, not emphasis,
                     so this is a span and not <strong>.

                     Every part must be an element. A highlight can end
                     mid-word ("Grinde|r"), and the compiler only drops the
                     newlines between the parts while they are whitespace-only
                     nodes — put bare interpolation here and the word comes
                     out split by a space. A test holds this. -->
                  @for (part of segments(item.name); track $index) {
                    <span [class.font-semibold]="part.match">{{
                      part.text
                    }}</span>
                  }
                </li>
              }
            </ul>
          </div>
        </div>
        <button
          type="submit"
          class="flex shrink-0 cursor-pointer items-center rounded-r-md border-l-2 border-primary bg-primary px-4 text-sm font-medium text-white transition-colors peer-hover:border-accent peer-focus-within:border-secondary hover:border-accent hover:bg-accent focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-white"
        >
          {{ text.submit }}
        </button>
      </div>
    </form>

    <!-- Sighted visitors watch the list appear; this is the same event for
         anyone who cannot. Polite, so it waits for a pause in the typing. -->
    <p aria-live="polite" class="sr-only">{{ announcement() }}</p>
  `,
})
export class SearchField {
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('input');

  // Read off the URL rather than from `ActivatedRoute`: the field lives in the
  // header, outside the outlet, so it has no route inputs of its own — and the
  // root route reports blank params on the first render, which would show an
  // empty field for a frame before filling it in.
  private readonly url = currentUrl();
  private readonly routeQuery = computed(() => {
    const urlTree = this.router.parseUrl(this.url());
    if (urlTree.root.children['primary']?.segments[0]?.path === 'search') {
      return urlTree.queryParams['q'] ?? '';
    }
    return '';
  });

  protected readonly text = inject(APP_TEXT).search;
  protected readonly maxLength = SEARCH_QUERY_MAX_LENGTH;
  protected readonly listId = `search-suggestions-${nextId++}`;

  /** Focus on first render — set by the mobile panel, which opens on demand. */
  readonly autoFocus = input(false);
  /**
   * Seeded from the URL rather than bound to it: landing on `/search?q=…`
   * (shared link, reload, back button) shows the query that produced the page,
   * but between navigations the field is the visitor's to edit. Only a new `q`
   * — which means a navigation happened — takes it back.
   */
  protected readonly value = linkedSignal(() => this.routeQuery());

  /**
   * Whether the visitor is composing a query, as opposed to looking at one
   * they already submitted. Only typing opens the list: arriving on
   * `/search?q=…` fills the field from the URL, and a dropdown covering the
   * results someone just asked for would be in their way.
   */
  private readonly typing = signal(false);
  /** Which option the keyboard is on; -1 is "none, Enter submits the query". */
  protected readonly activeIndex = signal(-1);

  /**
   * Suggestions for the settled query. Idle unless the visitor is typing,
   * which is what keeps this off the server during SSR and off the first
   * render. Superseded responses are dropped by `resource` itself, so a slow
   * answer for an early prefix cannot overwrite a later one.
   */
  private readonly query = debounced(this.value, SUGGEST_DEBOUNCE_MS);
  private readonly suggested = resource({
    params: () => {
      const q = this.query().trim();
      return this.isBrowser && this.typing() && q ? q : undefined;
    },
    loader: ({ params }) => this.catalog.getSearchSuggestions(params),
  });

  /**
   * The names on screen. A loading `resource` reports no value at all, and
   * rendering that directly makes the panel vanish and come back on every
   * keystroke — the previous answer is a far better placeholder for the next
   * one than nothing is, since one more letter usually narrows the same list.
   * So the last answer stays up until the new one replaces it, and only an
   * idle resource (nothing being asked) clears it.
   */
  protected readonly suggestions = linkedSignal<
    SearchSuggestion[] | undefined,
    SearchSuggestion[]
  >({
    source: () =>
      this.suggested.status() === 'idle' ? [] : this.suggested.value(),
    computation: (value, previous) => value ?? previous?.value ?? [],
  });

  /**
   * Whether the query on screen has been answered. Distinguishes "no matches"
   * from "not back yet", which is what stops a first query from flashing
   * "nothing found" on its way to a full list.
   */
  private readonly answered = computed(
    () => this.suggested.status() !== 'idle' && !this.suggested.isLoading(),
  );
  /**
   * Whether anything has come back at all during this typing session. Once it
   * has, the panel stays up until the session ends — it is what keeps the box
   * from closing and reopening between two answers, which is the same reason
   * `suggestions` holds the previous list rather than blanking.
   */
  private readonly opened = signal(false);
  /** An empty list, once the panel is up — a pending first query is neither
   * open nor "nothing found", and must not say so before the reply lands. */
  protected readonly noMatches = computed(
    () => this.panelOpen() && this.suggestions().length === 0,
  );

  /**
   * The panel is up from the first answer to the end of the typing session.
   * Anything narrower flickers: "nothing found" giving way to a pending request
   * would close the box for a beat and reopen it with the results.
   */
  protected readonly panelOpen = computed(() => this.typing() && this.opened());
  protected readonly activeOptionId = computed(() =>
    this.panelOpen() && this.activeIndex() >= 0
      ? `${this.listId}-${this.activeIndex()}`
      : null,
  );
  protected readonly announcement = computed(() => {
    if (!this.panelOpen()) return '';
    return this.noMatches()
      ? this.text.noSuggestions
      : this.text.suggestionCount.replace(
          '{count}',
          String(this.suggestions().length),
        );
  });

  constructor() {
    afterNextRender(() => {
      if (this.autoFocus()) this.input()?.nativeElement.focus();
    });
    // Opens on the first answer, and closes again only when there is nothing
    // being asked at all — an emptied field, or a session the visitor ended.
    effect(() => {
      if (this.suggested.status() === 'idle') this.opened.set(false);
      else if (this.answered()) this.opened.set(true);
    });
  }

  /** Highlighted against the settled query, not the live one: the names on
   * screen answered that query, and bolding them against later keystrokes
   * would flicker a highlight the list has not caught up with. */
  protected segments(name: string) {
    return matchSegments(name, this.query());
  }

  /** Every keystroke reopens the list and drops the keyboard selection — the
   * option that was highlighted answered the previous query, not this one. */
  protected type(value: string): void {
    this.value.set(value);
    this.typing.set(true);
    this.activeIndex.set(-1);
  }

  protected keydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        this.move(1, event);
        break;
      case 'ArrowUp':
        this.move(-1, event);
        break;
      case 'Enter':
        // Intercepted only when an option is selected; otherwise the form
        // submits the typed query, which is what keeps the full result list
        // reachable from the keyboard alone.
        {
          // Read through the list rather than trusting the index: names on
          // screen can be replaced by a later answer, and Enter must never
          // reach for a row that is no longer there.
          const selected = this.suggestions()[this.activeIndex()];
          if (selected) {
            event.preventDefault();
            this.go(selected.slug);
          }
        }
        break;
      case 'Escape':
        // Dismisses the list without touching the query. Swallowed only while
        // the list is open, so a second press still reaches the browser's own
        // "clear the search input" behaviour.
        if (this.panelOpen()) {
          event.preventDefault();
          this.close();
        }
        break;
      case 'Tab':
        this.close();
        break;
    }
  }

  /** Moves the selection, wrapping at both ends and passing through "nothing
   * selected" on the way — so the typed query is always one key away again. */
  private move(delta: number, event: KeyboardEvent): void {
    if (!this.panelOpen() || !this.suggestions().length) return;
    event.preventDefault();

    const count = this.suggestions().length;
    const next = this.activeIndex() + delta;
    this.activeIndex.set(next < -1 ? count - 1 : next >= count ? -1 : next);
  }

  /** `mousedown`, not `click`: the field would otherwise blur first, close the
   * list, and take the option out from under the pointer before it lands. */
  protected pick(event: MouseEvent, slug: string): void {
    event.preventDefault();
    this.go(slug);
  }

  private go(slug: string): void {
    this.close();
    void this.router.navigate(['/product', slug]);
  }

  protected close(): void {
    this.typing.set(false);
    this.opened.set(false);
    this.activeIndex.set(-1);
  }

  protected submit(event: Event): void {
    // The form is real so Enter works and it degrades without JS, which means
    // the browser would also navigate on its own — preventing that is what
    // hands the navigation to the router instead of a full page load.
    event.preventDefault();
    const q = this.value().trim();
    if (!q) return;
    this.close();
    void this.router.navigate(['/search'], { queryParams: { q } });
  }

  /** Empties the field and hands focus back, so the next query can be typed
   * without reaching for the input again. */
  protected clear(): void {
    this.value.set('');
    this.close();
    this.input()?.nativeElement.focus();
  }
}
