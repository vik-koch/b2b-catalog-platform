import { formatTaxRate } from '@b2b-catalog-platform/shared/core/catalog';
import { ADMIN_EXCHANGE_TEXT } from '../exchange-text';
import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  fillText,
  moneyFormat,
  formatMoneyMinor,
} from '@b2b-catalog-platform/shared/platform';
import {
  CatalogSyncPlan,
  CatalogSyncProductChange,
  CatalogSyncRowError,
} from '@b2b-catalog-platform/shared/core/exchange';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import {
  StatusBadge,
  StatusTone,
} from '@b2b-catalog-platform/ui/content/status-badge';
import { SyncPlanActions } from './sync-plan-actions';
import { SyncPlanTiles } from './sync-plan-tiles';
import { SyncRowErrors } from './sync-row-errors';

/**
 * What a catalog run would do, or did: the counts, the products, the
 * categories and the skipped rows. A staged run (`applicable`) also gets its
 * decisions; a finished one is a record.
 */
@Component({
  selector: 'app-sync-catalog-plan-view',
  imports: [
    Link,
    RouterLink,
    StatusBadge,
    SyncPlanActions,
    SyncPlanTiles,
    SyncRowErrors,
  ],
  template: `
    <section class="rounded-md border border-edge p-4">
      <h2 class="mb-4 text-lg font-normal tracking-tight">
        {{ title() }}
      </h2>

      <app-sync-plan-tiles [tiles]="tiles()" />

      @if (isNoop()) {
        <p class="text-ink-subtle">{{ noopText() }}</p>
      }

      <app-sync-row-errors [errors]="rowErrors()" />

      @if (createdCategories(); as created) {
        @if (created.length > 0) {
          <h3 class="mt-6 mb-1 text-sm font-medium">
            {{ text.categoriesTitle }}
          </h3>
          <p class="mb-2 text-sm text-ink-subtle">{{ text.categoriesHint }}</p>
          <ul class="space-y-1 text-sm">
            @for (category of created; track category.name) {
              <li>
                {{ category.name }}
                <span class="text-ink-subtle"
                  >({{ category.productCount }})</span
                >
              </li>
            }
          </ul>
        }
      }

      @if (renamedCategories(); as renamed) {
        @if (renamed.length > 0) {
          <h3 class="mt-6 mb-1 text-sm font-medium">
            {{ text.renamedCategoriesTitle }}
          </h3>
          <p class="mb-2 text-sm text-ink-subtle">
            {{ text.renamedCategoriesHint }}
          </p>
          <ul class="space-y-1 text-sm">
            @for (category of renamed; track category.name) {
              <li>
                <span class="line-through text-ink-subtle">{{
                  category.from
                }}</span>
                → {{ category.name }}
                <span class="text-ink-subtle"
                  >({{ category.productCount }})</span
                >
              </li>
            }
          </ul>
        }
      }

      @if (plan().products.length > 0) {
        <h3 class="mt-6 mb-2 text-sm font-medium">{{ text.productsTitle }}</h3>
        <ul class="divide-y divide-edge-subtle text-sm">
          @for (product of plan().products; track product.sourceId) {
            <li class="flex flex-wrap items-baseline gap-x-3 py-2">
              <span uiStatusBadge [tone]="kindTone(product.kind)">
                {{ text.count[product.kind] }}
              </span>
              <!-- The list narrowed to the sync key, never the editor: a
                   product this run creates has no page yet. -->
              <a
                uiLink
                class="font-medium"
                routerLink="/admin/products"
                [queryParams]="{ searchTerm: product.sourceId }"
                >{{ product.name }}</a
              >
              @for (change of product.changes; track change.field) {
                <span class="text-ink-subtle">
                  {{ change.field }}:
                  <span class="line-through">{{
                    display(change.field, change.from)
                  }}</span>
                  →
                  <span class="text-ink">{{
                    display(change.field, change.to)
                  }}</span>
                </span>
              }
            </li>
          }
        </ul>
      }

      @if (plan().emptiedCategories.length > 0) {
        <h3 class="mt-6 mb-1 text-sm font-medium">{{ text.emptiedTitle }}</h3>
        <p class="mb-2 text-sm text-ink-subtle">{{ text.emptiedHint }}</p>
        <ul class="space-y-1 text-sm">
          @for (category of plan().emptiedCategories; track category.slug) {
            <li>
              <a uiLink routerLink="/admin/categories">{{ category.name }}</a>
            </li>
          }
        </ul>
      }

      @if (plan().keptManual.length > 0) {
        <h3 class="mt-6 mb-1 text-sm font-medium">{{ text.keptTitle }}</h3>
        <p class="mb-2 text-sm text-ink-subtle">{{ text.keptHint }}</p>
        <ul class="space-y-1 text-sm">
          @for (kept of plan().keptManual; track kept.sourceId) {
            <li>
              <a
                uiLink
                routerLink="/admin/products"
                [queryParams]="{ searchTerm: kept.sourceId }"
                >{{ kept.name }}</a
              >
            </li>
          }
        </ul>
      }

      @if (plan().truncated) {
        <p class="mt-4 text-sm text-ink-subtle">{{ text.truncated }}</p>
      }

      @if (applicable()) {
        <app-sync-plan-actions
          [gate]="plan().summary.softDelete > 0 ? deleteWarning() : null"
          [noop]="isNoop()"
          [applyBlocked]="applyBlocked()"
          [discardable]="discardable()"
          [busy]="busy()"
          [error]="error()"
          (apply)="apply.emit()"
          (discardRun)="discardRun.emit()"
        />
      }
    </section>
  `,
})
export class SyncCatalogPlanView {
  protected readonly text = inject(ADMIN_EXCHANGE_TEXT).sync;
  private readonly currency = moneyFormat(inject(DEPLOYMENT_CONFIG));
  private readonly locale = inject(DEPLOYMENT_CONFIG).locale;

  readonly plan = input.required<CatalogSyncPlan>();
  /** A staged run, which can still be acted on. False for a record. */
  readonly applicable = input(false);
  /** Not for an upload's preview, which leaving the page throws away. */
  readonly discardable = input(false);

  /** Still staged, so still `applicable`, but no longer appliable. */
  readonly applyBlocked = input(false);
  /** An apply or a discard is in flight. */
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly apply = output<void>();
  readonly discardRun = output<void>();

  /** A decision is about what would happen; a record is about what did. */
  protected readonly title = computed(() =>
    this.applicable() ? this.text.summaryTitle : this.text.summaryTitleApplied,
  );

  protected readonly noopText = computed(() =>
    this.applicable() ? this.text.nothingToApply : this.text.nothingChanged,
  );

  protected readonly isNoop = computed(() => {
    const {
      create,
      update,
      softDelete,
      restore,
      categoriesCreated,
      categoriesRenamed,
    } = this.plan().summary;
    return (
      create +
        update +
        softDelete +
        restore +
        categoriesCreated +
        categoriesRenamed ===
      0
    );
  });

  protected readonly createdCategories = computed(() =>
    this.plan().categories.filter((category) => category.kind === 'create'),
  );

  protected readonly renamedCategories = computed(() =>
    this.plan().categories.filter((category) => category.kind === 'rename'),
  );

  /** Some counts are an answer even at zero and hold their place; the rest
   * earn a tile by happening. */
  protected readonly tiles = computed(() => {
    const s = this.plan().summary;
    return [
      { label: 'create' as const, value: s.create, danger: false },
      { label: 'update' as const, value: s.update, danger: false },
      {
        label: 'softDelete' as const,
        value: s.softDelete,
        danger: s.softDelete > 0,
      },
      { label: 'restore' as const, value: s.restore, danger: false },
      {
        label: 'categories' as const,
        value: s.categoriesCreated,
        danger: false,
      },
      {
        label: 'renamedCategories' as const,
        value: s.categoriesRenamed,
        danger: false,
      },
      { label: 'unchanged' as const, value: s.unchanged, danger: false },
      { label: 'kept' as const, value: s.keptManual, danger: false },
      { label: 'errors' as const, value: s.errors, danger: s.errors > 0 },
    ]
      .filter((tile) => tile.value > 0 || ALWAYS_SHOWN.has(tile.label))
      .map((tile) => ({ ...tile, label: this.text.count[tile.label] }));
  });

  protected readonly rowErrors = computed(() =>
    this.plan().rowErrors.map((error) => ({
      row: error.row,
      message: this.rowErrorText(error),
    })),
  );

  /** Prices arrive as minor units, rates as percents; everything else is
   * already display text. A rate's null is the default rate, not nothing. */
  protected display(field: string, value: string | number | null): string {
    if (field === 'taxRate') {
      return value === null
        ? this.text.taxRateDefault
        : `${formatTaxRate(Number(value), this.locale)}\u00a0%`;
    }
    if (value === null) return '—';
    if (typeof value === 'number') {
      return field.startsWith('price')
        ? formatMoneyMinor(value, this.currency)
        : String(value);
    }
    return value;
  }

  protected kindTone(kind: CatalogSyncProductChange['kind']): StatusTone {
    return KIND_TONE[kind];
  }

  private rowErrorText(error: CatalogSyncRowError): string {
    return fillText(this.text.rowErrors[error.code], error.params ?? {});
  }

  protected deleteWarning(): string {
    return fillText(this.text.deleteWarning, {
      count: this.plan().summary.softDelete,
    });
  }
}

/** Nothing added, changed, hidden or skipped is an answer too. */
const ALWAYS_SHOWN: ReadonlySet<string> = new Set([
  'create',
  'update',
  'softDelete',
  'errors',
]);

/** Arriving settled, leaving a refusal, coming back worth pointing out. */
const KIND_TONE: Record<CatalogSyncProductChange['kind'], StatusTone> = {
  create: 'ok',
  update: 'neutral',
  softDelete: 'danger',
  restore: 'info',
};
