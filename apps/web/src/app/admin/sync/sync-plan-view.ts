import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  fillText,
  SyncPlan,
  SyncProductChange,
  SyncRowError,
} from '@b2b-catalog-platform/shared';
import { formatPriceMinor } from '../../catalog/price';
import { ADMIN_TEXT } from '../../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Link } from '../../ui/link';
import { StatusBadge, StatusTone } from '../../ui/status-badge';

/**
 * What a run would do, or did: the counts, the products, the categories and
 * the rows that could not be read.
 *
 * One component for both, because they are the same diff at two moments — the
 * upload screen shows it before anything is written, and a run's own page
 * shows it afterwards. It was the upload screen's markup until a headless run
 * (FR-ADM-07) made a staged diff something an admin might meet without having
 * uploaded anything.
 *
 * `applicable` is what separates the two: a staged run gets the delete gate,
 * the Apply button and, where the caller offers it, the way to give up on the
 * run entirely. A finished one is a record, and shows none of them.
 */
@Component({
  selector: 'app-sync-plan-view',
  imports: [Button, Input, Link, RouterLink, StatusBadge],
  template: `
    <section class="rounded-md border border-border p-4">
      <h2 class="mb-4 text-lg font-normal tracking-tight">
        {{ title() }}
      </h2>

      <dl class="mb-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
        @for (tile of tiles(); track tile.label) {
          <div>
            <dt class="text-subtle">{{ text.count[tile.label] }}</dt>
            <dd class="text-lg font-medium" [class.text-red-700]="tile.danger">
              {{ tile.value }}
            </dd>
          </div>
        }
      </dl>

      @if (isNoop()) {
        <p class="text-muted">{{ noopText() }}</p>
      }

      @if (plan().rowErrors.length > 0) {
        <h3 class="mt-6 mb-2 text-sm font-medium text-red-700">
          {{ text.errorsTitle }}
        </h3>
        <ul class="space-y-1 text-sm text-stone-700">
          @for (error of plan().rowErrors; track $index) {
            <li>
              <span class="text-subtle">{{ rowLabel(error.row) }}</span>
              — {{ rowErrorText(error) }}
            </li>
          }
        </ul>
      }

      @if (createdCategories(); as created) {
        @if (created.length > 0) {
          <h3 class="mt-6 mb-1 text-sm font-medium">
            {{ text.categoriesTitle }}
          </h3>
          <p class="mb-2 text-sm text-subtle">{{ text.categoriesHint }}</p>
          <ul class="space-y-1 text-sm">
            @for (category of created; track category.name) {
              <li>
                {{ category.name }}
                <span class="text-subtle">({{ category.productCount }})</span>
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
          <p class="mb-2 text-sm text-subtle">
            {{ text.renamedCategoriesHint }}
          </p>
          <ul class="space-y-1 text-sm">
            @for (category of renamed; track category.name) {
              <li>
                <span class="line-through text-subtle">{{
                  category.from
                }}</span>
                → {{ category.name }}
                <span class="text-subtle">({{ category.productCount }})</span>
              </li>
            }
          </ul>
        }
      }

      @if (plan().products.length > 0) {
        <h3 class="mt-6 mb-2 text-sm font-medium">{{ text.productsTitle }}</h3>
        <ul class="divide-y divide-stone-100 text-sm">
          @for (product of plan().products; track product.sourceId) {
            <li class="flex flex-wrap items-baseline gap-x-3 py-2">
              <span appStatusBadge [tone]="kindTone(product.kind)">
                {{ text.kind[product.kind] }}
              </span>
              <!-- Always the list narrowed to this product's sync key, never
                   the editor: a product this run creates has no page to link to
                   at the time the diff is taken, and one destination that is
                   always right beats two that differ by row. The list also
                   shows what the run did not — its state, its stock, its
                   availability. -->
              <a
                appLink
                class="font-medium"
                routerLink="/admin/products"
                [queryParams]="{ searchTerm: product.sourceId }"
                >{{ product.name }}</a
              >
              @for (change of product.changes; track change.field) {
                <span class="text-subtle">
                  {{ change.field }}:
                  <span class="line-through">{{
                    display(change.field, change.from)
                  }}</span>
                  →
                  <span class="text-stone-700">{{
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
        <p class="mb-2 text-sm text-subtle">{{ text.emptiedHint }}</p>
        <ul class="space-y-1 text-sm">
          @for (category of plan().emptiedCategories; track category.slug) {
            <li>
              <a appLink routerLink="/admin/categories">{{ category.name }}</a>
            </li>
          }
        </ul>
      }

      @if (plan().keptManual.length > 0) {
        <h3 class="mt-6 mb-1 text-sm font-medium">{{ text.keptTitle }}</h3>
        <p class="mb-2 text-sm text-subtle">{{ text.keptHint }}</p>
        <ul class="space-y-1 text-sm">
          @for (kept of plan().keptManual; track kept.sourceId) {
            <li>
              <a
                appLink
                routerLink="/admin/products"
                [queryParams]="{ searchTerm: kept.sourceId }"
                >{{ kept.name }}</a
              >
            </li>
          }
        </ul>
      }

      @if (plan().truncated) {
        <p class="mt-4 text-sm text-subtle">{{ text.truncated }}</p>
      }

      @if (applicable()) {
        <!-- The delete gate: typed confirmation, and only when it applies. -->
        @if (plan().summary.softDelete > 0) {
          <div class="mt-6 rounded-md border border-red-200 bg-red-50 p-3">
            <p class="text-sm text-red-800">
              {{ deleteWarning() }}
            </p>
            <label class="mt-2 block text-sm">
              <span class="mb-1 block">{{ confirmLabel() }}</span>
              <input
                type="text"
                appInput
                class="font-mono"
                [value]="confirmation()"
                (input)="confirmation.set($any($event.target).value)"
              />
            </label>
          </div>
        }

        @if (!isNoop() || discardable()) {
          <div class="mt-6 flex flex-wrap items-center gap-3">
            @if (!isNoop()) {
              <button
                appButton
                type="button"
                [disabled]="!canApply() || busy()"
                (click)="apply.emit()"
              >
                {{ busy() ? text.applying : text.apply }}
              </button>
            }
            @if (discardable()) {
              <button
                appButton
                variant="dangerOutline"
                type="button"
                [disabled]="busy()"
                (click)="discardRun.emit()"
              >
                {{ text.discardRun }}
              </button>
            }
          </div>
        }

        @if (error(); as message) {
          <p class="mt-3 text-sm text-red-700" role="alert">{{ message }}</p>
        }
      }
    </section>
  `,
})
export class SyncPlanView {
  protected readonly text = inject(ADMIN_TEXT).sync;
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;

  readonly plan = input.required<SyncPlan>();
  /** A staged run, which can still be acted on. False for a record. */
  readonly applicable = input(false);
  /** Whether giving up on the run is offered — it is not, for a preview that
   * exists only in this browser and is thrown away by leaving the page. */
  readonly discardable = input(false);
  /** An apply or a discard is in flight. */
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly apply = output<void>();
  readonly discardRun = output<void>();

  protected readonly confirmation = signal('');

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
    ];
  });

  /** A run that hides products needs the confirmation word typed exactly. */
  protected readonly canApply = computed(
    () =>
      this.plan().summary.softDelete === 0 ||
      this.confirmation().trim() === this.text.deleteConfirmWord,
  );

  /** Prices arrive as minor units; everything else is already display text. */
  protected display(field: string, value: string | number | null): string {
    if (value === null) return '—';
    if (typeof value === 'number') {
      return field.startsWith('price')
        ? formatPriceMinor(value, this.currency)
        : String(value);
    }
    return value;
  }

  protected kindTone(kind: SyncProductChange['kind']): StatusTone {
    return KIND_TONE[kind];
  }

  /** The sentence for a skipped row, in this deployment's wording. */
  protected rowErrorText(error: SyncRowError): string {
    return fillText(this.text.rowErrors[error.code], error.params ?? {});
  }

  protected rowLabel(row: number): string {
    return fillText(this.text.errorRow, { row });
  }

  protected deleteWarning(): string {
    return fillText(this.text.deleteWarning, {
      count: this.plan().summary.softDelete,
    });
  }

  protected confirmLabel(): string {
    return fillText(this.text.deleteConfirmLabel, {
      word: this.text.deleteConfirmWord,
    });
  }
}

/** What the run would do to a row, in the app's own status tones: a product
 * arriving is settled, one leaving is a refusal, one coming back is worth
 * pointing out, and a plain edit is neither. */
const KIND_TONE: Record<SyncProductChange['kind'], StatusTone> = {
  create: 'ok',
  update: 'neutral',
  softDelete: 'danger',
  restore: 'info',
};
