import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { SEARCH_QUERY_MAX_LENGTH } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { currentUrl } from '../core/current-url';
import { CloseIcon } from '../ui/icons/close-icon';
import { SearchIcon } from '../ui/icons/search-icon';

/**
 * The search field itself (FR-SEARCH-01) — a real `<form>` around a real
 * `search` input, so Enter submits and the control degrades to a working search
 * box without JavaScript. Submitting navigates to `/search?q=…`.
 */
@Component({
  selector: 'app-search-field',
  imports: [SearchIcon, CloseIcon],
  host: { class: 'block' },
  template: `
    <form
      role="search"
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
        <!-- The border lives on the wrapper, not the input, so the leading
             glyph sits inside it. -->
        <div
          class="peer relative flex min-w-0 flex-1 items-center rounded-l-md border-2 border-r-0 border-primary bg-white hover:border-accent focus-within:border-accent"
        >
          <!-- Leading glyph: a label for the field rather than a control, so it
               is muted and takes no pointer events. -->
          <app-icon-search
            class="pointer-events-none absolute left-2.5 h-4 w-4 text-subtle"
          />
          <input
            #input
            type="search"
            name="q"
            enterkeyhint="search"
            autocomplete="off"
            [maxLength]="maxLength"
            [attr.aria-label]="text.placeholder"
            [placeholder]="text.placeholder"
            [value]="value()"
            (input)="value.set($any($event.target).value)"
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
              <app-icon-close class="h-4 w-4" />
              <span class="sr-only">{{ text.clear }}</span>
            </button>
          }
        </div>
        <button
          type="submit"
          class="flex shrink-0 cursor-pointer items-center rounded-r-md border-l-2 border-primary bg-primary px-4 text-sm font-medium text-white transition-colors peer-hover:border-accent peer-focus-within:border-accent hover:border-accent hover:bg-accent focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-white"
        >
          {{ text.submit }}
        </button>
      </div>
    </form>
  `,
})
export class SearchField {
  private readonly router = inject(Router);
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('input');

  // Read off the URL rather than from `ActivatedRoute`: the field lives in the
  // header, outside the outlet, so it has no route inputs of its own — and the
  // root route reports blank params on the first render, which would show an
  // empty field for a frame before filling it in.
  private readonly url = currentUrl();
  private readonly routeQuery = computed(
    () => this.router.parseUrl(this.url()).queryParams['q'] ?? '',
  );

  protected readonly text = inject(APP_TEXT).search;
  protected readonly maxLength = SEARCH_QUERY_MAX_LENGTH;

  /** Focus on first render — set by the mobile panel, which opens on demand. */
  readonly autoFocus = input(false);
  /**
   * Seeded from the URL rather than bound to it: landing on `/search?q=…`
   * (shared link, reload, back button) shows the query that produced the page,
   * but between navigations the field is the visitor's to edit. Only a new `q`
   * — which means a navigation happened — takes it back.
   */
  protected readonly value = linkedSignal(() => this.routeQuery());

  constructor() {
    afterNextRender(() => {
      if (this.autoFocus()) this.input()?.nativeElement.focus();
    });
  }

  protected submit(event: Event): void {
    // The form is real so Enter works and it degrades without JS, which means
    // the browser would also navigate on its own — preventing that is what
    // hands the navigation to the router instead of a full page load.
    event.preventDefault();
    const q = this.value().trim();
    if (!q) return;
    void this.router.navigate(['/search'], { queryParams: { q } });
  }

  /** Empties the field and hands focus back, so the next query can be typed
   * without reaching for the input again. */
  protected clear(): void {
    this.value.set('');
    this.input()?.nativeElement.focus();
  }
}
