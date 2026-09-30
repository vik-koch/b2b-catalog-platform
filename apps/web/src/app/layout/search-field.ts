import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  afterRenderEffect,
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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationSkipped, Router } from '@angular/router';
import { filter } from 'rxjs';
import {
  fillText,
  pieceFloor,
  ProductListItem,
  SEARCH_QUERY_MAX_LENGTH,
  SearchCategory,
} from '@b2b-catalog-platform/shared';
import { CartAddResult, CartService } from '../cart/cart.service';
import { CatalogService } from '../catalog/catalog.service';
import { CategoryChip } from '../catalog/category-chip';
import { ImagePlaceholder } from '../catalog/image-placeholder';
import { useProductUnits } from '../catalog/product-units-view';
import { APP_TEXT } from '../config/app-text';
import { MobileSearch } from './mobile-search';
import { currentUrl } from '../core/current-url';
import { debounced } from '../core/debounced';
import { HighlightedLine } from '../core/highlighted-line';
import { Button } from '../ui/button';
import { IconButton } from '../ui/icon-button';
import { FRAME } from '../ui/frame';
import { Icon } from '../ui/icons/icon';
import { WarningNote } from '../ui/warning-note';

/** Long enough that a fast typist produces one request per word rather than
 * one per letter, short enough that a pause feels answered immediately. */
const SUGGEST_DEBOUNCE_MS = 200;

/** What the panel shows; also its answer while nothing is being asked. */
type Suggestions = { items: ProductListItem[]; categories: SearchCategory[] };
const NONE: Suggestions = { items: [], categories: [] };

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
 * list of matching products, and picking one goes straight to that product.
 * Suggestions are an accelerator layered on top and never become the only way
 * through — which is why the form underneath is untouched, and why Enter still
 * submits the typed query whenever no suggestion is selected.
 *
 * A row carries the picture and the price (FR-SEARCH-06), and a button that
 * puts the product in the cart without leaving the field — a cart can be
 * filled from one query and settled on the cart page. Only that: the unit,
 * the quantity, the note and the counterparts are the cart's business, and a
 * row that offered them would be a listing squeezed into a dropdown.
 *
 * Because a row holds two things to act on, the popup is a grid rather than a
 * listbox (the ARIA grid-combobox pattern): a listbox option may not contain a
 * button. The caret stays in the field throughout; the arrow keys walk the
 * rows, and right and left step between the product and its button.
 */
@Component({
  selector: 'app-search-field',
  imports: [
    Icon,
    HighlightedLine,
    ImagePlaceholder,
    Button,
    WarningNote,
    CategoryChip,
    IconButton,
  ],
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
           the button's own hover takes it back. Focus outranks hover on the
           field, rather than the two being left to whichever order Tailwind
           emits — with a cursor the pointer is still over the field it just
           put the caret in, so the field would light amber where a phone lit
           it secondary and the same state would have two colours. Either highlight therefore
           closes around its control instead of stopping short of the seam.
           Both stretch to the row's height, which keeps them the same size. -->
      <div class="flex items-stretch">
        <!-- Also the positioning context for the dropdown, which hangs off the
             field rather than off the whole row: it lines up with the text
             being typed, not with the submit button. The border lives on the
             wrapper, not the input, so the leading glyph sits inside it. -->
        <div
          class="peer relative flex min-w-0 flex-1 items-center rounded-l-md border-2 border-r-0 border-primary bg-white/80 not-focus-within:hover:border-accent focus-within:border-secondary"
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
            (focus)="mobileSearch.setFocused(true)"
            (blur)="blurred()"
            class="min-w-0 flex-1 bg-transparent py-2 pr-1 pl-9 text-sm text-stone-800 placeholder:text-subtle focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          @if (value()) {
            <!-- flex on the button itself, not just on its row: the icon is an
                 inline element otherwise, and would sit on the text baseline
                 rather than on the field's centre line. -->
            <button
              type="button"
              class="mr-1 flex shrink-0 cursor-pointer items-center justify-center rounded-full p-1.5 text-subtle transition-colors hover:text-accent active:text-primary-deep"
              (click)="clear()"
            >
              <app-icon name="close" class="h-4 w-4" />
              <span class="sr-only">{{ text.clear }}</span>
            </button>
          }

          <!-- Kept in the DOM and hidden rather than removed: the element
               aria-controls names should not vanish from under the input
               between queries. The message is a sibling of the grid, not a
               row inside it — "nothing found" is not something to pick.

               Every press inside the panel is kept from taking focus, so the
               caret never leaves the field: a blur would close the panel under
               the pointer before the click landed, and adding a product would
               end the query it was found by.

               At least 22rem wide, spilling past the field's end where the
               header leaves it narrow: a picture, a name and a price do not
               fit in the field's own width there, and a row broken into one
               word per line is a row nobody scans. -->
          <div
            [class.hidden]="!panelOpen()"
            class="absolute top-full right-0 left-0 z-20 mt-1 flex min-w-[min(22rem,100vw_-_2rem)] flex-col overflow-hidden rounded-md border border-border-strong bg-white shadow-lg"
            (mousedown)="$event.preventDefault()"
          >
            @if (noMatches()) {
              <p class="px-3 py-3 text-sm text-subtle">
                {{ text.noSuggestions }}
              </p>
            }
            <div
              [id]="listId"
              role="grid"
              [attr.aria-label]="text.suggestionsLabel"
              class="flex min-h-0 flex-col"
            >
              @if (categories().length) {
                <!-- The categories the query names (FR-SEARCH-07), ahead of
                     the products and held above their scrolling: a shortcut
                     that scrolled away behind ten products would be found by
                     nobody. One row of chips, sideways when they do not fit —
                     three stacked chips would take half the panel. The same
                     chip the catalogue draws everywhere else.

                     Scrolled the way the main page's featured row is: no
                     scrollbar, a chip cut at the edge for a thumb, and arrows
                     for a mouse, which has no sideways gesture to find — in a
                     heading row over the chips, as the featured row has them,
                     rather than laid on the chips' names. They stay out of the
                     accessibility tree: the keyboard walks the chips with the
                     arrow keys, and each one it reaches is scrolled into view. -->
                <div class="shrink-0 border-b border-border pt-2">
                  <div class="flex h-7 items-center justify-between gap-2 px-3">
                    <span
                      [id]="listId + '-categories'"
                      class="text-xs font-medium text-subtle"
                      >{{ text.categoriesLabel }}</span
                    >
                    @if (stripBack() || stripForward()) {
                      <span class="hidden gap-1 pointer-fine:flex">
                        <button
                          appIconButton
                          size="sm"
                          type="button"
                          tabindex="-1"
                          aria-hidden="true"
                          [disabled]="!stripBack()"
                          (click)="pageStrip(-1)"
                        >
                          <app-icon name="chevron-right" class="rotate-180" />
                        </button>
                        <button
                          appIconButton
                          size="sm"
                          type="button"
                          tabindex="-1"
                          aria-hidden="true"
                          [disabled]="!stripForward()"
                          (click)="pageStrip(1)"
                        >
                          <app-icon name="chevron-right" />
                        </button>
                      </span>
                    }
                  </div>
                  <div
                    #strip
                    role="row"
                    [attr.aria-labelledby]="listId + '-categories'"
                    [class]="stripClass"
                    (scroll)="measureStrip()"
                  >
                    @for (
                      category of categories();
                      track category.slug;
                      let j = $index
                    ) {
                      <div
                        role="gridcell"
                        [id]="cellId(0, j)"
                        [attr.aria-selected]="isActive(0, j)"
                        class="flex rounded-xl"
                        [class.outline-2]="isActive(0, j)"
                        [class.-outline-offset-2]="isActive(0, j)"
                      >
                        <app-category-chip
                          size="small"
                          [category]="category"
                          [context]="category.parent"
                          [query]="query()"
                        />
                      </div>
                    }
                  </div>
                </div>
              }

              <!-- Scrolls rather than grows: ten rows would cover the page the
                   visitor is on. About four and a half fit, the half saying
                   there is more below. -->
              <div
                role="rowgroup"
                class="max-h-[min(22.5rem,60dvh)] overflow-y-auto overscroll-contain"
              >
                @for (item of suggestions(); track item.slug; let i = $index) {
                  <div
                    role="row"
                    class="flex items-center gap-3 py-2 pr-3 pl-2"
                    [class.bg-stone-100]="i + offset() === activeIndex()"
                    (mouseenter)="hover(i + offset())"
                  >
                    <div
                      role="gridcell"
                      [id]="cellId(i + offset(), 0)"
                      [attr.aria-selected]="isActive(i + offset(), 0)"
                      class="flex min-w-0 flex-1 cursor-pointer items-center gap-3"
                      (mousedown)="go(item.slug)"
                    >
                      <!-- Decorative: the name beside it says what it shows. -->
                      <span [class]="thumb">
                        @if (
                          item.images[0] && !failed().has(item.images[0].thumb)
                        ) {
                          <img
                            [src]="item.images[0].thumb"
                            alt=""
                            class="h-full w-full object-cover"
                            (error)="markFailed(item.images[0].thumb)"
                          />
                        } @else {
                          <app-image-placeholder aria-hidden="true" />
                        }
                      </span>
                      <span class="flex min-w-0 flex-col gap-0.5">
                        <!-- The same marked run the address and company fields
                           draw: one query should look like one query wherever
                           it is typed. Highlighted against the settled query
                           rather than the live one — the names on screen
                           answered that query, and marking them against later
                           keystrokes would flicker a highlight the list has
                           not caught up with. -->
                        <span class="line-clamp-2 text-sm text-stone-800">
                          <app-highlighted-line
                            [line]="item.name"
                            [query]="query()"
                          />
                        </span>
                        <!-- The per-piece price, as a listing leads with it
                           (FR-UNIT-08) — and the viewer's own, since the API
                           resolves it for their tier (FR-AUTH-05). -->
                        <span
                          class="text-sm font-semibold whitespace-nowrap text-ink"
                        >
                          {{ price(item).price }}
                          <span class="text-xs font-normal text-subtle">{{
                            price(item).label
                          }}</span>
                        </span>
                      </span>
                    </div>

                    <div
                      role="gridcell"
                      [id]="cellId(i + offset(), 1)"
                      [attr.aria-selected]="isActive(i + offset(), 1)"
                      class="shrink-0"
                    >
                      @if (inCart(item)) {
                        <!-- A mark, not a button: the line is in the cart, and
                           its quantity is changed there — pressing again here
                           would add to it without saying by how much. Drawn as
                           the listing's "added" field is, in the box the
                           button had, so the row does not move. -->
                        <span
                          role="img"
                          [attr.aria-label]="inCartLabel(item)"
                          [class]="addBox + ' ' + addedMark"
                        >
                          <app-icon name="circle-check" class="h-4 w-4" />
                        </span>
                      } @else {
                        <!-- Out of the tab order: the caret stays in the field
                           and the keyboard reaches this with the arrows, so it
                           wears the focus ring while it is the active cell. -->
                        <button
                          type="button"
                          appButton
                          tabindex="-1"
                          [class]="addBox + ' px-0'"
                          [class.outline-2]="isActive(i + offset(), 1)"
                          [class.outline-offset-2]="isActive(i + offset(), 1)"
                          [attr.aria-label]="addLabel(item)"
                          [disabled]="item.availability === 'out'"
                          (click)="add(item)"
                        >
                          <app-icon name="shopping-basket" class="h-4 w-4" />
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>

            @if (full()) {
              <app-warning-note class="mx-3 my-2" role="status">
                {{ cartText.full }}
              </app-warning-note>
            }

            @if (suggestions().length) {
              <!-- Where submitting the query goes, for a pointer that is
                   already down here. Enter without a selection does the same
                   from the keyboard, so this stays out of the tab order. -->
              <button
                type="button"
                tabindex="-1"
                class="flex cursor-pointer items-center justify-center gap-1 border-t border-border px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-stone-100 hover:text-accent active:text-primary-deep"
                (click)="showAll()"
              >
                {{ text.showAllResults }}
                <app-icon name="chevron-right" class="h-4 w-4" />
              </button>
            }
          </div>
        </div>
        <!-- The one control that overrides the app's focus outline: secondary
             on this primary fill is barely a shade apart, and an outline
             outside the box would sit beyond the field's rounded edge. White,
             drawn inside. -->
        <button
          type="submit"
          class="flex shrink-0 cursor-pointer items-center rounded-r-md border-l-2 border-primary bg-primary px-3 text-sm font-medium text-white transition-colors peer-[:hover:not(:focus-within)]:border-accent peer-focus-within:border-secondary hover:border-accent hover:bg-accent active:border-primary-deep active:bg-primary-deep focus-visible:-outline-offset-2 focus-visible:outline-1 focus-visible:outline-white"
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
  /** Only to say whether the caret is here — see MobileSearch.active, which the
   * bottom bar's search tab is lit from. */
  protected readonly mobileSearch = inject(MobileSearch);
  private readonly catalog = inject(CatalogService);
  private readonly cart = inject(CartService);
  private readonly units = useProductUnits();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
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
  protected readonly cartText = inject(APP_TEXT).cart;
  protected readonly maxLength = SEARCH_QUERY_MAX_LENGTH;
  protected readonly listId = `search-suggestions-${nextId++}`;

  /** Focus on first render — set by the phone's search overlay, which opens on
   * demand. */
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
  /** Which row the keyboard is on; -1 is "none, Enter submits the query".
   * Row 0 is the category strip where there is one, then the products. */
  protected readonly activeIndex = signal(-1);
  /** Which cell of it: a chip of the strip, or a product row's 0 (the
   * product) and 1 (its add button). */
  private readonly activeCell = signal(0);
  /** Set when the last add was refused because the cart is at its line limit;
   * cleared by the next keystroke. */
  protected readonly full = signal(false);

  /** Photos that failed to load, drawn as the placeholder instead. */
  protected readonly failed = signal<ReadonlySet<string>>(new Set());

  protected readonly thumb = `block h-16 w-16 shrink-0 overflow-hidden rounded-md ${FRAME}`;
  /** The add button's box, and the mark's that replaces it — one size, so a
   * row does not move when one becomes the other. */
  protected readonly addBox = 'inline-flex h-9 w-9 items-center justify-center';
  /** 18rem a chip, whatever the panel's width: one match does not stretch
   * across a wide panel, and two lines of name beside a mark have the room
   * they need on a narrow one. */
  protected readonly stripClass =
    'grid auto-cols-[18rem] grid-flow-col gap-2 overflow-x-auto overscroll-x-contain px-2 pt-1 pb-2 ' +
    'snap-x snap-mandatory scroll-px-2 motion-safe:scroll-smooth ' +
    '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
  private readonly strip = viewChild<ElementRef<HTMLElement>>('strip');
  protected readonly stripBack = signal(false);
  protected readonly stripForward = signal(false);
  protected readonly addedMark =
    'animate-field-in rounded-md bg-secondary text-white select-none';

  /**
   * Suggestions for the settled query. Idle unless the visitor is typing,
   * which is what keeps this off the server during SSR and off the first
   * render. Superseded responses are dropped by `resource` itself, so a slow
   * answer for an early prefix cannot overwrite a later one.
   */
  protected readonly query = debounced(this.value, SUGGEST_DEBOUNCE_MS);
  private readonly suggested = resource({
    params: () => {
      const q = this.query().trim();
      return this.isBrowser && this.typing() && q ? q : undefined;
    },
    loader: ({ params }) => this.catalog.getSearchSuggestions(params),
  });

  /**
   * The answer on screen. A loading `resource` reports no value at all, and
   * rendering that directly makes the panel vanish and come back on every
   * keystroke — the previous answer is a far better placeholder for the next
   * one than nothing is, since one more letter usually narrows the same list.
   * So the last answer stays up until the new one replaces it, and only an
   * idle resource (nothing being asked) clears it.
   */
  private readonly answer = linkedSignal<Suggestions | undefined, Suggestions>({
    source: () =>
      this.suggested.status() === 'idle' ? NONE : this.suggested.value(),
    computation: (value, previous) => value ?? previous?.value ?? NONE,
  });
  protected readonly suggestions = computed(() => this.answer().items);
  protected readonly categories = computed(() => this.answer().categories);
  /** The products' first row: after the category strip, where there is one. */
  protected readonly offset = computed(() =>
    this.categories().length ? 1 : 0,
  );
  private readonly rowCount = computed(
    () => this.offset() + this.suggestions().length,
  );

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
    () => this.panelOpen() && this.rowCount() === 0,
  );

  /**
   * The panel is up from the first answer to the end of the typing session.
   * Anything narrower flickers: "nothing found" giving way to a pending request
   * would close the box for a beat and reopen it with the results.
   */
  protected readonly panelOpen = computed(() => this.typing() && this.opened());
  protected readonly activeOptionId = computed(() =>
    this.panelOpen() && this.activeIndex() >= 0
      ? this.cellId(this.activeIndex(), this.activeCell())
      : null,
  );
  protected readonly announcement = computed(() => {
    if (!this.panelOpen()) return '';
    return this.noMatches()
      ? this.text.noSuggestions
      : fillText(this.text.suggestionCount, {
          count: this.suggestions().length + this.categories().length,
        });
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
    // Whether the strip has anywhere to go changes with its chips and with
    // the panel's width, not only with scrolling.
    afterRenderEffect(() => {
      this.categories();
      this.panelOpen();
      this.measureStrip();
    });
    // Any navigation ends the query — a chip is a plain link, and the page it
    // opens is the answer, not something to keep a panel open over. A skipped
    // one too: a chip for the category already open goes nowhere, and a panel
    // left open over the page it asked for reads as a press that did nothing.
    this.router.events
      .pipe(
        filter(
          (event) =>
            event instanceof NavigationEnd ||
            event instanceof NavigationSkipped,
        ),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.close());
    // The list scrolls, so a row the arrow keys reach may be out of sight —
    // `nearest` leaves a visible one where it is.
    effect(() => {
      const id = this.activeOptionId();
      if (!id) return;
      // The cell rather than its row: the strip scrolls sideways.
      this.host.nativeElement
        .querySelector(`#${id}`)
        ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    });
  }

  protected measureStrip(): void {
    const strip = this.strip()?.nativeElement;
    // A pixel's slack: a scroll position can land a fraction short of the end.
    this.stripBack.set(!!strip && strip.scrollLeft > 1);
    this.stripForward.set(
      !!strip && strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1,
    );
  }

  /** A panel's width at a time; the snap lands it on a chip's edge. */
  protected pageStrip(direction: 1 | -1): void {
    const strip = this.strip()?.nativeElement;
    strip?.scrollBy({ left: direction * strip.clientWidth });
  }

  protected cellId(row: number, cell: number): string {
    return `${this.listId}-${row}-${cell}`;
  }

  protected isActive(row: number, cell: number): boolean {
    return this.activeIndex() === row && this.activeCell() === cell;
  }

  protected price(item: ProductListItem) {
    // A piece always has a price, so this is never null.
    return (
      this.units.priceRow(item.prices, 'piece') ?? { price: '', label: '' }
    );
  }

  protected inCart(item: ProductListItem): boolean {
    return this.cart.lineFor(item.slug) !== undefined;
  }

  protected addLabel(item: ProductListItem): string {
    return fillText(this.text.addSuggestion, { name: item.name });
  }

  protected inCartLabel(item: ProductListItem): string {
    return fillText(this.text.suggestionInCart, { name: item.name });
  }

  protected markFailed(src: string): void {
    this.failed.update((failed) => new Set(failed).add(src));
  }

  /** The pointer takes the row, and the product cell with it: the button's
   * own hover says when it is the one under the pointer. */
  protected hover(row: number): void {
    this.activeIndex.set(row);
    this.activeCell.set(0);
  }

  /**
   * Puts the product in the cart as the smallest order it takes, in pieces —
   * what the buying controls would add untouched. The panel stays open, so the
   * next product is one press away; the unit and the quantity are settled on
   * the cart page.
   */
  protected add(item: ProductListItem): void {
    if (item.availability === 'out' || this.inCart(item)) return;
    const result: CartAddResult = this.cart.add({
      slug: item.slug,
      name: item.name,
      unit: 'piece',
      pieces: pieceFloor(item.packaging),
      note: null,
      prices: item.prices,
      packaging: item.packaging,
      image: item.images[0]
        ? { full: item.images[0].full, thumb: item.images[0].thumb }
        : null,
      availability: item.availability,
      lineNoteEnabled: item.lineNoteEnabled,
      lineNotePrompt: item.lineNotePrompt,
      pairedCount: item.pairedCount,
      parts: [...item.parts],
      variants: [...item.variants],
      images: [...item.images],
    });
    this.full.set(result === 'full');
  }

  /** Every keystroke reopens the list and drops the keyboard selection — the
   * option that was highlighted answered the previous query, not this one. */
  protected type(value: string): void {
    this.value.set(value);
    this.typing.set(true);
    this.activeIndex.set(-1);
    this.activeCell.set(0);
    this.full.set(false);
  }

  protected keydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        this.move(1, event);
        break;
      case 'ArrowUp':
        this.move(-1, event);
        break;
      case 'ArrowRight':
      case 'ArrowLeft':
        // Only while a row is selected: otherwise these move the caret, which
        // is what they are for in a text field.
        if (this.panelOpen() && this.activeIndex() >= 0) {
          event.preventDefault();
          const step = event.key === 'ArrowRight' ? 1 : -1;
          this.activeCell.set(
            Math.min(
              Math.max(this.activeCell() + step, 0),
              this.lastCell(this.activeIndex()),
            ),
          );
        }
        break;
      case 'Enter':
        // Intercepted only when a row is selected; otherwise the form submits
        // the typed query, which is what keeps the full result list reachable
        // from the keyboard alone.
        {
          // Read through the list rather than trusting the index: rows on
          // screen can be replaced by a later answer, and Enter must never
          // reach for a row that is no longer there.
          const row = this.activeIndex();
          const category =
            row === 0 && this.offset() === 1
              ? this.categories()[this.activeCell()]
              : undefined;
          if (category) {
            event.preventDefault();
            this.close();
            void this.router.navigate(['/catalog', category.slug]);
            break;
          }
          const selected = this.suggestions()[row - this.offset()];
          if (selected) {
            event.preventDefault();
            if (this.activeCell() === 1) this.add(selected);
            else this.go(selected.slug);
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
    if (!this.panelOpen() || !this.rowCount()) return;
    event.preventDefault();

    const count = this.rowCount();
    const next = this.activeIndex() + delta;
    const row = next < -1 ? count - 1 : next >= count ? -1 : next;
    this.activeIndex.set(row);
    // The column is kept from row to row, as a grid keeps it, as far as the
    // new row reaches — but back in the field there is no row to keep it for.
    this.activeCell.set(
      row < 0 ? 0 : Math.min(this.activeCell(), this.lastCell(row)),
    );
  }

  /** The last cell of a row: the strip's last chip, or a product's button. */
  private lastCell(row: number): number {
    return row === 0 && this.offset() === 1 ? this.categories().length - 1 : 1;
  }

  protected go(slug: string): void {
    this.close();
    void this.router.navigate(['/product', slug]);
  }

  /** The caret leaving takes the suggestions with it, and unlights the bottom
   * bar's search tab — the tab is the field's, wherever the field is. */
  protected blurred(): void {
    this.close();
    this.mobileSearch.setFocused(false);
  }

  protected close(): void {
    this.typing.set(false);
    this.opened.set(false);
    this.activeIndex.set(-1);
    this.activeCell.set(0);
    this.full.set(false);
  }

  protected submit(event: Event): void {
    // The form is real so Enter works and it degrades without JS, which means
    // the browser would also navigate on its own — preventing that is what
    // hands the navigation to the router instead of a full page load.
    event.preventDefault();
    this.showAll();
  }

  protected showAll(): void {
    const q = this.value().trim();
    if (!q) return;
    this.close();
    void this.router.navigate(['/search'], { queryParams: { q } });
  }

  /** Puts the caret in the field. Called straight out of a tap on the bottom
   * bar's search tab, and synchronously: a mobile browser opens its keyboard
   * for a focus that happened inside the gesture and not for one that happened
   * a tick later.
   *
   * `preventScroll` because the caller may want to do the scrolling itself:
   * the browser's own is an instant jump, and a field being fetched from
   * off-screen is worth watching arrive. */
  focus(): void {
    this.input()?.nativeElement.focus({ preventScroll: true });
  }

  /** Empties the field and hands focus back, so the next query can be typed
   * without reaching for the input again. */
  protected clear(): void {
    this.value.set('');
    this.close();
    this.input()?.nativeElement.focus();
  }
}
