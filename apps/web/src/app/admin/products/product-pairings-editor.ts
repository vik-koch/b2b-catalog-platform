import {
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import {
  AdminProductListItem,
  fillText,
  PairedProduct,
  PRODUCT_PAIRINGS_MAX,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { HighlightedLine } from '../../core/highlighted-line';
import { SUGGEST_PANEL, SuggestList } from '../../core/suggest-list';
import {
  DISCLOSURE_FRAME,
  disclosureBorder,
  DisclosureToggle,
} from '../../ui/disclosure-toggle';
import { FieldLabel } from '../../ui/field-label';
import { IconButton } from '../../ui/icon-button';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Input } from '../../ui/input';
import { StatusBadge } from '../../ui/status-badge';
import { AdminCatalogService } from '../admin-catalog.service';

/** `aria-controls` must name one list, and a page may hold more than one. */
let nextId = 0;

/** Enough rows to choose from without the panel becoming a listing of its own. */
const SUGGESTIONS_SHOWN = 8;

/**
 * The products this one is sold together with (FR-SET-01) — a search field that
 * suggests products by name, and the counterparts picked so far.
 *
 * A disclosure rather than a checkbox, though it hides the same way the note
 * prompt does: there is no stored flag here to check. A checkbox would be a
 * control whose off state has no meaning — unchecking it either loses the
 * pairings silently or lies about them — while the lid's count says how many
 * there are without opening it, which is the thing an admin scrolling past
 * wants to know.
 *
 * Counterparts that are deleted or unpublished are listed **marked**, not
 * dropped: a soft delete is reversible and an unpublished product is usually
 * one still being prepared, so the link an admin made outlives both. They are
 * simply not offered as new ones — a deleted product is not something to start
 * selling alongside.
 */
@Component({
  selector: 'app-product-pairings-editor',
  imports: [
    AdminIcon,
    DisclosureToggle,
    FieldLabel,
    HighlightedLine,
    IconButton,
    Input,
    StatusBadge,
  ],
  host: { class: 'block' },
  template: `
    <!-- The attribute picker's box: lid, count, and one border around
         everything it opens. -->
    <div
      class="max-w-xl rounded-md border"
      [class]="frame + ' ' + disclosureBorder(open())"
    >
      <app-disclosure-toggle
        [label]="text.heading"
        [count]="value().length"
        [countLabel]="countLabel()"
        [open]="open()"
        [panelId]="panelId"
        (toggled)="open.set(!open())"
      />
      @if (open()) {
        <div [id]="panelId" class="border-t border-border p-4">
          <p class="text-xs text-subtle">{{ text.hint }}</p>

          @if (value().length > 0) {
            <ul class="mt-3 divide-y divide-border border-y border-border">
              @for (item of value(); track item.slug) {
                <li class="flex items-center gap-2 py-1.5 text-sm">
                  <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
                  @if (item.deleted) {
                    <span appStatusBadge tone="danger">
                      {{ text.deleted }}
                    </span>
                  } @else if (item.unpublished) {
                    <span appStatusBadge tone="waiting">
                      {{ text.unpublished }}
                    </span>
                  }
                  <button
                    appIconButton
                    type="button"
                    [attr.aria-label]="removeLabel(item)"
                    (click)="remove(item.slug)"
                  >
                    <app-admin-icon name="x" />
                  </button>
                </li>
              }
            </ul>
          }

          @if (value().length >= max) {
            <p class="mt-3 text-xs text-subtle">{{ limitLabel() }}</p>
          } @else {
            <div class="mt-3">
              <label [for]="inputId" appFieldLabel>{{ text.add }}</label>
              <div class="relative">
                <input
                  [id]="inputId"
                  type="text"
                  role="combobox"
                  autocomplete="off"
                  aria-autocomplete="list"
                  [attr.aria-expanded]="list.panelOpen()"
                  [attr.aria-controls]="listId"
                  [attr.aria-activedescendant]="activeOptionId()"
                  appInput
                  class="w-full"
                  [value]="query()"
                  [placeholder]="text.addPlaceholder"
                  (input)="type($any($event.target).value)"
                  (keydown)="keydown($event)"
                  (blur)="list.close()"
                />

                @if (list.panelOpen()) {
                  <div [class]="panel">
                    @if (options().length === 0) {
                      <p class="px-3 py-2 text-sm text-subtle">
                        {{ text.noSuggestions }}
                      </p>
                    }
                    <ul
                      [id]="listId"
                      role="listbox"
                      [attr.aria-label]="text.suggestionsLabel"
                    >
                      @for (
                        item of options();
                        track item.slug;
                        let i = $index
                      ) {
                        <li
                          [id]="listId + '-' + i"
                          role="option"
                          [attr.aria-selected]="i === list.activeIndex()"
                          class="cursor-pointer px-3 py-2 text-sm"
                          [class.bg-stone-100]="i === list.activeIndex()"
                          (mouseenter)="list.activeIndex.set(i)"
                          (mousedown)="pick($event, item)"
                        >
                          <span class="block truncate">
                            <app-highlighted-line
                              [line]="item.name"
                              [query]="list.query()"
                            />
                          </span>
                          @if (item.publishedAt === null) {
                            <span class="block text-xs text-subtle">
                              {{ text.unpublished }}
                            </span>
                          }
                        </li>
                      }
                    </ul>
                  </div>
                }
              </div>
            </div>
            <p aria-live="polite" class="sr-only">{{ announcement() }}</p>
          }
        </div>
      }
    </div>
  `,
})
export class ProductPairingsEditor implements OnInit {
  protected readonly frame = DISCLOSURE_FRAME;
  protected readonly disclosureBorder = disclosureBorder;
  private readonly service = inject(AdminCatalogService);
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly text = inject(ADMIN_TEXT).productEditor.pairings;

  readonly value = input.required<readonly PairedProduct[]>();
  /**
   * The product being edited, so it cannot be offered as its own counterpart.
   * Null while it has no slug yet — a new product cannot be in the catalog the
   * search reads, so there is nothing to exclude.
   */
  readonly ownSlug = input<string | null>(null);

  readonly valueChange = output<PairedProduct[]>();

  protected readonly max = PRODUCT_PAIRINGS_MAX;
  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly panel = SUGGEST_PANEL;
  protected readonly listId = `pairing-suggestions-${++nextId}`;
  protected readonly panelId = `pairings-panel-${nextId}`;
  protected readonly inputId = `pairing-search-${nextId}`;

  /**
   * One name is enough of a query here: this searches our own catalog rather
   * than a metered provider, and an admin pairing a lid types "lid".
   */
  protected readonly list = new SuggestList<AdminProductListItem>({
    load: (q) =>
      this.service.listProducts({ q, sort: 'relevance' }).then((r) => r.items),
    minLength: 2,
  });

  /**
   * What is actually offerable: not this product, not one already paired, and
   * not a deleted one. Filtered here rather than in the query because the grid
   * endpoint answers the same question the grid asks — "all states" — and the
   * three exclusions are about this form, not about the catalog.
   */
  protected readonly options = computed(() => {
    const taken = new Set(this.value().map((p) => p.slug));
    const own = this.ownSlug();
    return this.list
      .suggestions()
      .filter(
        (item) =>
          item.deletedAt === null && item.slug !== own && !taken.has(item.slug),
      )
      .slice(0, SUGGESTIONS_SHOWN);
  });

  protected readonly countLabel = computed(() =>
    fillText(this.common.countSuffix, { count: this.value().length }),
  );

  protected readonly limitLabel = computed(() =>
    fillText(this.text.limit, { count: this.max }),
  );

  protected readonly activeOptionId = computed(() =>
    this.list.panelOpen() && this.list.activeIndex() >= 0
      ? `${this.listId}-${this.list.activeIndex()}`
      : null,
  );

  /** Counted after the exclusions, so it says what is on screen. */
  protected readonly announcement = computed(() => {
    if (!this.list.panelOpen()) return '';
    const count = this.options().length;
    return count === 0
      ? this.text.noSuggestions
      : fillText(this.text.suggestionCount, { count });
  });

  /** Open where there is something to see. Read once, in `ngOnInit`: a panel
   * that closed itself when the last pairing was removed would take the field
   * that puts one back with it. */
  ngOnInit(): void {
    this.open.set(this.value().length > 0);
  }

  protected type(value: string): void {
    this.query.set(value);
    this.list.type(value);
  }

  protected keydown(event: KeyboardEvent): void {
    const chosen = this.list.keydown(event);
    if (chosen) this.add(chosen);
  }

  /** mousedown, not click: the field's own blur would close the panel first. */
  protected pick(event: MouseEvent, item: AdminProductListItem): void {
    event.preventDefault();
    this.add(item);
  }

  private add(item: AdminProductListItem): void {
    this.valueChange.emit([
      ...this.value(),
      {
        slug: item.slug,
        name: item.name,
        deleted: false,
        unpublished: item.publishedAt === null,
      },
    ]);
    // The field empties on a pick: the next one is a different search, and a
    // panel of matches for the name just chosen is a list of what to skip.
    this.query.set('');
    this.list.close();
  }

  protected remove(slug: string): void {
    this.valueChange.emit(this.value().filter((p) => p.slug !== slug));
  }

  protected removeLabel(item: PairedProduct): string {
    return fillText(this.text.remove, { name: item.name });
  }
}
