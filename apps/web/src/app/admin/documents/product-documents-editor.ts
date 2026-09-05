import {
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { fillText, LinkedDocument } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
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
import { Link } from '../../ui/link';
import { DocumentsService } from './documents.service';

/** `aria-controls` must name one list, and a page may hold more than one. */
let nextId = 0;

/** Enough rows to choose from without the panel becoming a listing of its own. */
const SUGGESTIONS_SHOWN = 8;

/**
 * The documents shown on one product (FR-DOC-02), in the product's own form —
 * the pairings editor's shape, deliberately, because it is the same job: a
 * short list of things attached to this one record, added one at a time.
 *
 * The other side of the link edits it in bulk (a certificate onto thirty
 * espressos in one pass), and that screen has a picker built for that. This one
 * answers the opposite question — "this product should not carry that
 * certificate" — which is one row, here, where the admin already is.
 *
 * Both write the same table and both send the whole set from their own side,
 * exactly as two products' pairing editors do.
 *
 * The suggestions come from the whole document list, which is a few dozen rows
 * fetched once; the search is over titles in the browser.
 */
@Component({
  selector: 'app-product-documents-editor',
  imports: [
    RouterLink,
    AdminIcon,
    DisclosureToggle,
    FieldLabel,
    HighlightedLine,
    IconButton,
    Input,
    Link,
  ],
  host: { class: 'block' },
  template: `
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
              @for (item of value(); track item.id) {
                <li class="flex items-center gap-2 py-1.5 text-sm">
                  <!-- The title goes to the document itself, which is where the
                       file, the dates and every other product on it live. -->
                  <a
                    appLink
                    class="min-w-0 flex-1 truncate"
                    [routerLink]="['/admin/documents', item.id, 'edit']"
                    >{{ item.title }}</a
                  >
                  <span class="shrink-0 text-xs text-subtle">
                    {{ expiry(item) }}
                  </span>
                  <button
                    appIconButton
                    type="button"
                    [attr.aria-label]="removeLabel(item)"
                    (click)="remove(item.id)"
                  >
                    <app-admin-icon name="x" />
                  </button>
                </li>
              }
            </ul>
          }

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
                    @for (item of options(); track item.id; let i = $index) {
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
                            [line]="item.title"
                            [query]="list.query()"
                          />
                        </span>
                        <span class="block text-xs text-subtle">
                          {{ expiry(item) }}
                        </span>
                      </li>
                    }
                  </ul>
                </div>
              }
            </div>
          </div>
          <p aria-live="polite" class="sr-only">{{ announcement() }}</p>
        </div>
      }
    </div>
  `,
})
export class ProductDocumentsEditor implements OnInit {
  protected readonly frame = DISCLOSURE_FRAME;
  protected readonly disclosureBorder = disclosureBorder;
  private readonly service = inject(DocumentsService);
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly text = inject(ADMIN_TEXT).productEditor.documents;

  readonly value = input.required<readonly LinkedDocument[]>();
  readonly valueChange = output<LinkedDocument[]>();

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly panel = SUGGEST_PANEL;
  protected readonly listId = `document-suggestions-${++nextId}`;
  protected readonly panelId = `documents-panel-${nextId}`;
  protected readonly inputId = `document-search-${nextId}`;

  private readonly locale = inject(DEPLOYMENT_CONFIG).catalog.currency.locale;
  private readonly dayFormat = new Intl.DateTimeFormat(this.locale, {
    dateStyle: 'medium',
  });

  /**
   * The whole document list, fetched once and searched here: there are a few
   * dozen of them, and a title is short enough that a substring match is a
   * better answer than the catalog's typo-tolerant matcher would be.
   */
  private readonly documents = resource({
    // Projected to what a link carries: the row the list endpoint returns knows
    // about files and counts, and none of that belongs in a product's save.
    loader: () =>
      this.service
        .list()
        .then((all) =>
          all.map(({ id, title, expiresAt }) => ({ id, title, expiresAt })),
        )
        .catch(() => []),
  });

  protected readonly list = new SuggestList<LinkedDocument>({
    load: async (q) => {
      const term = q.trim().toLocaleLowerCase(this.locale);
      return (this.documents.value() ?? []).filter((document) =>
        document.title.toLocaleLowerCase(this.locale).includes(term),
      );
    },
    minLength: 1,
  });

  /** What is offerable: everything not already on this product. */
  protected readonly options = computed(() => {
    const taken = new Set(this.value().map((d) => d.id));
    return this.list
      .suggestions()
      .filter((document) => !taken.has(document.id))
      .slice(0, SUGGESTIONS_SHOWN);
  });

  protected readonly countLabel = computed(() =>
    fillText(this.common.countSuffix, { count: this.value().length }),
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

  /** Open where there is something to see — the pairings editor's rule, for
   * the same reason: a panel that closed itself when the last row went would
   * take the field that puts one back with it. */
  ngOnInit(): void {
    this.open.set(this.value().length > 0);
  }

  protected expiry(document: LinkedDocument): string {
    return document.expiresAt
      ? fillText(this.text.expires, {
          date: this.dayFormat.format(new Date(document.expiresAt)),
        })
      : this.text.noExpiry;
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
  protected pick(event: MouseEvent, item: LinkedDocument): void {
    event.preventDefault();
    this.add(item);
  }

  private add(item: LinkedDocument): void {
    this.valueChange.emit([...this.value(), item]);
    // The field empties on a pick: the next one is a different search.
    this.query.set('');
    this.list.close();
  }

  protected remove(id: string): void {
    this.valueChange.emit(this.value().filter((d) => d.id !== id));
  }

  protected removeLabel(item: LinkedDocument): string {
    return fillText(this.text.remove, { name: item.title });
  }
}
