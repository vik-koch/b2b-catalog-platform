import {
  Component,
  computed,
  inject,
  input,
  output,
  resource,
  signal,
} from '@angular/core';
import { ADMIN_CATALOG_PAGE_SIZE } from '@b2b-catalog-platform/shared/admin/catalog';
import { fillText } from '@b2b-catalog-platform/shared';
import { LinkedProduct } from '@b2b-catalog-platform/shared/admin/catalog';

import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { debounced } from '@b2b-catalog-platform/ui/core/debounced';
import { AlternateLayout } from '../../../shared/core/alternate-layout';
import { Checkbox } from '@b2b-catalog-platform/ui/choices/checkbox';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { SelectInput } from '@b2b-catalog-platform/ui/inputs/select-input';
import {
  SegmentOption,
  Segmented,
} from '@b2b-catalog-platform/ui/choices/segmented';
import { StatusBadge } from '@b2b-catalog-platform/ui/content/status-badge';
import { CategoriesService } from '../categories/categories.service';
import { ProductsService } from '../products/products.service';
import { flattenCategoryTree } from '../categories/category-tree';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';

/** `id`s must be unique on a page, and a form may hold more than one picker. */
let nextId = 0;

/** One request per word, not per letter, as every admin search field. */
const SEARCH_DEBOUNCE_MS = 200;

type View = 'all' | 'linked';

/**
 * The products a document is shown on (FR-DOC-02): the catalog to tick
 * through, narrowed by name and category, with shift-click ticking a run. A
 * certificate covers a range, so this is unlike the add-one-at-a-time pairings
 * editor. `Linked` lists the value itself, so a deleted product still unlinks.
 */
@Component({
  selector: 'app-document-products-picker',
  imports: [
    Checkbox,
    FieldLabel,
    Input,
    SelectInput,
    Segmented,
    StatusBadge,
    ErrorText,
  ],
  host: { class: 'block' },
  template: `
    <div class="flex flex-nowrap items-end justify-between gap-3">
      <div>
        <span uiFieldLabel class="mb-0">{{ text.heading }}</span>
        <p class="mt-1 text-xs wrap-break-word text-ink-subtle">
          {{ text.hint }}
        </p>
      </div>
      <ui-segmented
        class="shrink-0"
        [options]="viewOptions()"
        [value]="view()"
        [ariaLabel]="text.heading"
        (valueChange)="view.set($event)"
      />
    </div>

    <div class="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr]">
      <input
        uiInput
        type="search"
        autocomplete="off"
        class="w-full"
        [attr.aria-label]="text.searchAria"
        [placeholder]="text.searchPlaceholder"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
      />
      <ui-select-input>
        <select
          uiInput
          class="w-full"
          [attr.aria-label]="text.categoryAria"
          [value]="categoryId()"
          (change)="categoryId.set($any($event.target).value)"
        >
          <option value="">{{ text.allCategories }}</option>
          @for (option of categoryOptions(); track option.id) {
            <option [value]="option.id">{{ option.label }}</option>
          }
        </select>
      </ui-select-input>
    </div>

    @if (products.error()) {
      <p uiErrorText class="mt-3" role="alert">{{ text.loadError }}</p>
    }

    <!-- Fixed height, or a broad search pushes the save button off screen. -->
    <ul
      class="mt-3 max-h-80 divide-y divide-edge overflow-y-auto rounded-md
             border border-edge"
      [attr.aria-busy]="products.isLoading() ? 'true' : null"
    >
      @for (row of rows(); track row.slug; let index = $index) {
        <li>
          <label
            class="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm
                   select-none
                   hover:bg-surface-subtle-hover"
          >
            <input
              type="checkbox"
              uiCheckbox
              [id]="rowId(index)"
              [checked]="isLinked(row.slug)"
              (click)="toggle($event, index)"
            />
            <span class="min-w-0 flex-1 truncate">{{ row.name }}</span>
            @if (row.deleted) {
              <span uiStatusBadge tone="danger">{{
                productStates.deleted
              }}</span>
            } @else if (row.unpublished) {
              <span uiStatusBadge tone="waiting">{{
                productStates.unpublished
              }}</span>
            }
            <span
              class="w-32 shrink-0 truncate text-right text-xs text-ink-subtle"
            >
              {{ row.category }}
            </span>
          </label>
        </li>
      } @empty {
        <li class="px-3 py-6 text-center text-sm text-ink-subtle">
          {{ view() === 'linked' ? text.noneLinked : text.empty }}
        </li>
      }
    </ul>

    @if (more(); as note) {
      <p class="mt-2 text-xs text-ink-subtle">{{ note }}</p>
    }
  `,
})
export class DocumentProductsPicker {
  private readonly productsService = inject(ProductsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly layout = inject(AlternateLayout);
  protected readonly text = inject(ADMIN_TEXT).documents.editor.products;
  protected readonly productStates = inject(ADMIN_TEXT).products;

  readonly value = input.required<readonly LinkedProduct[]>();
  readonly valueChange = output<LinkedProduct[]>();

  protected readonly view = signal<View>('all');
  protected readonly query = signal('');
  protected readonly categoryId = signal('');
  private readonly idBase = `document-products-${++nextId}`;

  /** Where a shift-click's range starts. */
  private anchor: number | null = null;

  protected readonly viewOptions = computed<SegmentOption<View>[]>(() => [
    { value: 'all', label: this.text.showAll },
    {
      value: 'linked',
      label: fillText(this.text.showLinked, { count: this.value().length }),
    },
  ]);

  private readonly debouncedQuery = debounced(this.query, SEARCH_DEBOUNCE_MS);

  private readonly categories = resource({
    loader: () => this.categoriesService.list(),
  });

  protected readonly categoryOptions = computed(() =>
    flattenCategoryTree(this.categories.value() ?? []).map((node) => ({
      id: node.category.id,
      label: `${'  '.repeat(node.depth)}${node.category.name}`,
    })),
  );

  private readonly categoryName = computed(
    () => new Map((this.categories.value() ?? []).map((c) => [c.id, c.name])),
  );

  /** `All` leaves deleted products out: a document is not started on a product
   * that is not sold. */
  protected readonly products = resource({
    params: () => ({
      q: this.debouncedQuery(),
      categoryId: this.categoryId() || undefined,
    }),
    loader: ({ params }) =>
      this.productsService.list({
        q: params.q,
        categoryId: params.categoryId,
        state: 'all',
        sort: params.q ? 'relevance' : 'name',
      }),
  });

  /** One shape for both views, so the row template does not branch. */
  protected readonly rows = computed<(LinkedProduct & { category: string })[]>(
    () => {
      if (this.view() === 'linked') return this.linkedRows();
      const names = this.categoryName();
      return (this.products.value()?.items ?? [])
        .filter((item) => item.deletedAt === null)
        .map((item) => ({
          slug: item.slug,
          name: item.name,
          deleted: false,
          unpublished: item.publishedAt === null,
          category: names.get(item.categoryId) ?? '',
        }));
    },
  );

  /** From the value, not a query: a deleted product is still linked and must
   * stay unlinkable. */
  private linkedRows(): (LinkedProduct & { category: string })[] {
    const found = this.layout.matches(this.debouncedQuery());
    return this.value()
      .filter((p) => found(p.name))
      .map((p) => ({ ...p, category: '' }));
  }

  /** The page is capped, so a truncated list says so. */
  protected readonly more = computed(() => {
    if (this.view() === 'linked') return null;
    const total = this.products.value()?.pagination.total ?? 0;
    return total > ADMIN_CATALOG_PAGE_SIZE
      ? fillText(this.text.more, {
          count: ADMIN_CATALOG_PAGE_SIZE,
          total,
        })
      : null;
  });

  protected rowId(index: number): string {
    return `${this.idBase}-${index}`;
  }

  protected isLinked(slug: string): boolean {
    return this.value().some((p) => p.slug === slug);
  }

  /**
   * With shift, every row from the last one clicked is set to what this row
   * becomes. The browser's own toggle is prevented, so the box follows the
   * value instead of racing it. A key press arrives as an unshifted click.
   */
  protected toggle(event: MouseEvent, index: number): void {
    event.preventDefault();
    const rows = this.rows();
    const row = rows[index];
    if (!row) return;

    const linked = !this.isLinked(row.slug);
    const from = event.shiftKey && this.anchor !== null ? this.anchor : index;
    const range = rows.slice(Math.min(from, index), Math.max(from, index) + 1);
    this.anchor = index;

    const next = new Map(this.value().map((p) => [p.slug, p]));
    for (const target of range) {
      if (linked) {
        next.set(target.slug, {
          slug: target.slug,
          name: target.name,
          deleted: target.deleted,
          unpublished: target.unpublished,
        });
      } else {
        next.delete(target.slug);
      }
    }
    // Name order, as the server hands the list back.
    this.valueChange.emit(
      [...next.values()].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }
}
