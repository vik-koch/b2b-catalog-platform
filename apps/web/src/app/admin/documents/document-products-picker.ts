import {
  Component,
  computed,
  inject,
  input,
  output,
  resource,
  signal,
} from '@angular/core';
import {
  AdminProductListItem,
  ADMIN_CATALOG_PAGE_SIZE,
  DocumentProduct,
  fillText,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { debounced } from '../../core/debounced';
import { Checkbox } from '../../ui/checkbox';
import { FieldLabel } from '../../ui/field-label';
import { Input } from '../../ui/input';
import { SelectField } from '../../ui/select-field';
import { StatusBadge } from '../../ui/status-badge';
import { AdminCatalogService } from '../admin-catalog.service';
import { flattenCategoryTree } from '../categories/category-tree';

/** `id`s must be unique on a page, and a form may hold more than one picker. */
let nextId = 0;

/** Long enough that a fast typist produces one request per word rather than
 * one per letter — the same number every other admin search field uses. */
const SEARCH_DEBOUNCE_MS = 200;

/** Which set of products the list is showing. */
type View = 'all' | 'linked';

/**
 * The products a document is shown on (FR-DOC-02) — a catalog to tick through,
 * not a search box that adds one product at a time.
 *
 * Deliberately unlike the pairings editor beside it, because the job is not the
 * same one. A pairing is a considered statement about two products, made a few
 * at a time; a certificate covers a *range*, and the admin attaching it is
 * working down a list of thirty espressos. So this shows the catalog — narrowed
 * by name and by category, the two things staff group products by — with a tick
 * per row, and **shift-click ticks a run**, the way every file list has since
 * they were invented.
 *
 * The `Linked` view is what a second list of chosen products would otherwise
 * be: the same rows, narrowed to the ones already ticked, so "what is on this
 * document" is one click away without duplicating the list that answers it.
 * Products no search would return — deleted, or renamed out of the query — are
 * listed there from the value itself rather than from the catalog.
 */
@Component({
  selector: 'app-document-products-picker',
  imports: [Checkbox, FieldLabel, Input, SelectField, StatusBadge],
  host: { class: 'block' },
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <span appFieldLabel class="mb-0">{{ text.heading }}</span>
      <!-- Two buttons rather than a checkbox: they are two views of one list,
           and the count is what an admin looks at while ticking. -->
      <div
        class="flex overflow-hidden rounded-md border border-border-strong text-sm"
        role="group"
        [attr.aria-label]="text.heading"
      >
        @for (option of views; track option.view) {
          <button
            type="button"
            class="cursor-pointer px-3 py-1.5 transition-colors"
            [class]="
              view() === option.view
                ? 'bg-primary text-white'
                : 'hover:text-accent'
            "
            [attr.aria-pressed]="view() === option.view"
            (click)="view.set(option.view)"
          >
            {{ option.label() }}
          </button>
        }
      </div>
    </div>

    <p class="mt-1 text-xs text-subtle">{{ text.hint }}</p>

    <div class="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr]">
      <input
        appInput
        type="search"
        autocomplete="off"
        class="w-full"
        [attr.aria-label]="text.search"
        [placeholder]="text.searchPlaceholder"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
      />
      <app-select-field>
        <select
          appInput
          class="w-full"
          [attr.aria-label]="text.category"
          [value]="categoryId()"
          (change)="categoryId.set($any($event.target).value)"
        >
          <option value="">{{ text.allCategories }}</option>
          @for (option of categoryOptions(); track option.id) {
            <option [value]="option.id">{{ option.label }}</option>
          }
        </select>
      </app-select-field>
    </div>

    @if (products.error()) {
      <p class="mt-3 text-sm text-red-700" role="alert">{{ text.loadError }}</p>
    }

    <!-- A fixed-height scroller: the list is up to fifty rows, and a form that
         grows by a screenful when a search matches everything is one nobody can
         reach the save button in. -->
    <ul
      class="mt-3 max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border"
      [attr.aria-busy]="products.isLoading() ? 'true' : null"
    >
      @for (row of rows(); track row.slug; let index = $index) {
        <li>
          <label
            class="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm select-none hover:bg-stone-50"
          >
            <input
              type="checkbox"
              appCheckbox
              [id]="rowId(index)"
              [checked]="isLinked(row.slug)"
              (click)="toggle($event, index)"
            />
            <span class="min-w-0 flex-1 truncate">{{ row.name }}</span>
            @if (row.deleted) {
              <span appStatusBadge tone="danger">{{ text.deleted }}</span>
            } @else if (row.unpublished) {
              <span appStatusBadge tone="waiting">{{ text.unpublished }}</span>
            }
            <span class="w-32 shrink-0 truncate text-right text-xs text-subtle">
              {{ row.category }}
            </span>
          </label>
        </li>
      } @empty {
        <li class="px-3 py-6 text-center text-sm text-muted">
          {{ view() === 'linked' ? text.noneLinked : text.empty }}
        </li>
      }
    </ul>

    <!-- What the list is not showing, said where the list ends. -->
    @if (more(); as note) {
      <p class="mt-2 text-xs text-subtle">{{ note }}</p>
    }
  `,
})
export class DocumentProductsPicker {
  private readonly service = inject(AdminCatalogService);
  protected readonly text = inject(ADMIN_TEXT).documentEditor.products;

  readonly value = input.required<readonly DocumentProduct[]>();
  readonly valueChange = output<DocumentProduct[]>();

  protected readonly view = signal<View>('all');
  protected readonly query = signal('');
  protected readonly categoryId = signal('');
  private readonly idBase = `document-products-${++nextId}`;

  /** The last row a click landed on — where a shift-click's range starts. */
  private anchor: number | null = null;

  protected readonly views = [
    { view: 'all' as const, label: () => this.text.showAll },
    {
      view: 'linked' as const,
      label: () =>
        fillText(this.text.showLinked, { count: this.value().length }),
    },
  ];

  private readonly debouncedQuery = debounced(this.query, SEARCH_DEBOUNCE_MS);

  private readonly categories = resource({
    loader: () => this.service.listCategories(),
  });

  /** The tree flattened depth-first, as every other category picker shows it. */
  protected readonly categoryOptions = computed(() =>
    flattenCategoryTree(this.categories.value() ?? []).map((node) => ({
      id: node.category.id,
      label: `${'  '.repeat(node.depth)}${node.category.name}`,
    })),
  );

  private readonly categoryName = computed(
    () => new Map((this.categories.value() ?? []).map((c) => [c.id, c.name])),
  );

  /**
   * The catalog page the `All` view ticks through. Deleted products are left
   * out — a document is not something to start showing on a product that is
   * not sold — but they stay listed under `Linked`, where the value carries
   * them.
   */
  protected readonly products = resource({
    params: () => ({
      q: this.debouncedQuery(),
      categoryId: this.categoryId() || undefined,
    }),
    loader: ({ params }) =>
      this.service.listProducts({
        q: params.q,
        categoryId: params.categoryId,
        state: 'all',
        sort: params.q ? 'relevance' : 'name',
      }),
  });

  /** One shape for both views, so the row template does not branch. */
  protected readonly rows = computed<
    (DocumentProduct & { category: string })[]
  >(() => {
    const names = this.categoryName();
    if (this.view() === 'linked') return this.linkedRows();
    return (this.products.value()?.items ?? [])
      .filter((item: AdminProductListItem) => item.deletedAt === null)
      .map((item: AdminProductListItem) => ({
        slug: item.slug,
        name: item.name,
        deleted: false,
        unpublished: item.publishedAt === null,
        category: names.get(item.categoryId) ?? '',
      }));
  });

  /**
   * The linked view is drawn from the value, not from a query: a product that
   * was deleted, or that this search would not return, is still linked and
   * still has to be unlinkable. Narrowed by the search box for the same reason
   * the other view is — thirty ticks are easier to find one in when typed at.
   */
  private linkedRows(): (DocumentProduct & { category: string })[] {
    const term = this.debouncedQuery().trim().toLocaleLowerCase();
    return this.value()
      .filter((p) => !term || p.name.toLocaleLowerCase().includes(term))
      .map((p) => ({ ...p, category: '' }));
  }

  /** The page is capped; say so rather than leaving a truncated list looking
   * complete. */
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
   * One tick, or — with shift held — every row between the last one clicked
   * and this one, all set to what this row just became. The browser's own
   * toggle is prevented so the checkbox follows the value rather than racing
   * it; a keyboard press arrives here as a click with no shift, which is the
   * single-row case.
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
    // Name order, so the list a save writes reads the same as the one the
    // server hands back.
    this.valueChange.emit(
      [...next.values()].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }
}
