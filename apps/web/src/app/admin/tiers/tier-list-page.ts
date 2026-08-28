import { moveItemInArray } from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, resource, signal } from '@angular/core';
import { CustomerTier, tierKeySchema } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { APP_TEXT } from '../../config/app-text';
import { usePageSeo } from '../../core/page-seo';
import { delayedLoading } from '../../core/delayed-loading';
import { Button } from '../../ui/button';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Input } from '../../ui/input';
import { FieldLabel } from '../../ui/field-label';
import { Skeleton } from '../../ui/skeleton';
import { ConfirmService } from '../../ui/confirm.service';
import { TiersService } from './tiers.service';
import { RouterLink } from '@angular/router';

/** The row currently in edit mode: an existing tier's id, or the new-tier form. */
type EditTarget = { id: string } | { id: null } | null;

/**
 * Customer tiers (FR-AUTH-05, admin side) — the deployment's price lists.
 *
 * A tier is two fields, so there is no editor screen: rows edit in place and
 * the add form is the same markup with nothing in it. That is the whole reason
 * this differs from categories and products, which have enough content to earn
 * a route of their own.
 *
 * The first row is the base price list. It is not a tier — it is
 * `products.defaultPriceMinor` — so it has no id, no sync key of its own
 * beyond the reserved `price` column, and no actions; it is drawn here because
 * an admin thinking about price lists is thinking about that one too, and its
 * account count is real data only the server can give.
 */
@Component({
  selector: 'app-tier-list-page',
  imports: [
    NgTemplateOutlet,
    Button,
    AdminIcon,
    Input,
    FieldLabel,
    Skeleton,
    RouterLink,
  ],
  template: `
    <div class="mb-4 flex items-center justify-between gap-4">
      <h1 class="text-3xl font-bold tracking-tight">{{ text.title }}</h1>
      <button
        appButton
        type="button"
        class="gap-2"
        [disabled]="editing() !== null"
        (click)="startAdd()"
      >
        <app-admin-icon name="plus" class="h-4 w-4" />
        {{ text.add }}
      </button>
    </div>

    <p class="mb-6 max-w-xl text-sm text-muted">{{ text.intro }}</p>

    <!-- Narrower than the heading above it: everything below is a column of
         fields and rows to read down, not a table to scan across, and a line
         that runs the full width of a desktop is a line nobody follows. -->
    <div class="max-w-3xl">
      @if (reorderError()) {
        <p class="mb-4 text-sm text-red-700" role="alert">
          {{ text.reorderError }}
        </p>
      }

      @if (tiers.error()) {
        <p class="text-muted" role="alert">{{ catalogText.loadError }}</p>
      } @else if (tiers.hasValue()) {
        <!-- overflow-hidden so a row's own background cannot square off the
           card's rounded corners. -->
        <div
          class="divide-y divide-border overflow-hidden rounded-lg border border-border"
        >
          <!-- The base list, pinned first and inert: nothing about it is stored,
             so there is nothing here to change. It sits outside the drop list
             too — it is not a row anyone can move. -->
          <div
            class="bg-white flex flex-wrap items-baseline gap-x-3 gap-y-1 p-4"
          >
            <span class="font-medium text-stone-700">
              {{ text.defaultLabel }}
            </span>
            <span class="text-sm text-subtle">
              {{ accountsLabel(tiers.value().defaultUserCount) }}
            </span>
            <p class="w-full text-sm text-muted">{{ text.defaultHint }}</p>
          </div>

          <ul class="divide-y divide-border">
            @for (tier of tiers.value().tiers; track tier.id; let i = $index) {
              <li class="p-4 bg-white">
                @if (isEditing(tier.id)) {
                  <ng-container [ngTemplateOutlet]="form" />
                } @else {
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <!-- Ordering is for staff eyes only, so the handle sits with
                       the row's other affordances and carries no explanation
                       beyond its label. -->
                    <span class="font-medium text-stone-700">{{
                      tier.label
                    }}</span>
                    <code class="rounded bg-stone-100 px-1.5 py-0.5 text-xs">
                      {{ tier.key }}
                    </code>
                    <span class="text-sm text-subtle">
                      {{ accountsLabel(tier.userCount) }} ·
                      <!-- The count is the way to the products behind it:
                           "which products did we agree a rate on?" is the
                           question every review of a tier starts from, and the
                           admin grid is where it is answered. A link only when
                           there is something to show. -->
                      @if (tier.priceCount > 0) {
                        <a
                          routerLink="/admin/products"
                          [queryParams]="{ tierId: tier.id }"
                          class="underline hover:text-accent"
                          [title]="text.seePrices"
                        >
                          {{ pricesLabel(tier.priceCount) }}
                        </a>
                      } @else {
                        {{ pricesLabel(tier.priceCount) }}
                      }
                    </span>
                    <span class="ml-auto flex items-center gap-1">
                      <!-- Ordering is a secondary concern on this screen, so it
                         sits with the row's other actions rather than claiming
                         a handle column of its own. -->
                      <button
                        type="button"
                        class="p-1 text-stone-400 hover:text-accent disabled:invisible"
                        [attr.aria-label]="text.moveUp"
                        [disabled]="i === 0 || busy() || editing() !== null"
                        (click)="move(i, i - 1)"
                      >
                        <app-admin-icon name="chevron-up" class="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        class="p-1 text-stone-400 hover:text-accent disabled:invisible"
                        [attr.aria-label]="text.moveDown"
                        [disabled]="
                          i === tiers.value().tiers.length - 1 ||
                          busy() ||
                          editing() !== null
                        "
                        (click)="move(i, i + 1)"
                      >
                        <app-admin-icon name="chevron-down" class="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        class="p-1 text-stone-400 hover:text-accent"
                        [attr.aria-label]="text.edit"
                        [disabled]="editing() !== null"
                        (click)="startEdit(tier)"
                      >
                        <app-admin-icon name="pencil" class="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        class="p-1 text-stone-400 hover:text-red-700"
                        [attr.aria-label]="text.delete"
                        [disabled]="busy()"
                        (click)="remove(tier)"
                      >
                        <app-admin-icon name="trash-2" class="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                  @if (rowError()?.id === tier.id) {
                    <p class="mt-2 text-sm text-red-700" role="alert">
                      {{ rowError()?.message }}
                    </p>
                  }
                }
              </li>
            }
          </ul>

          @if (isEditing(null)) {
            <div class="p-4 bg-white">
              <ng-container [ngTemplateOutlet]="form" />
            </div>
          } @else if (tiers.value().tiers.length === 0) {
            <p class="p-4 text-sm text-muted">{{ text.empty }}</p>
          }
        </div>
      } @else if (showSkeleton()) {
        <app-skeleton [lines]="4" />
      }

      <!-- One form for both add and edit: a tier is a name and a key either way,
         and the only difference is which request the save makes. -->
      <ng-template #form>
        <!-- Fields and buttons share one baseline (items-end); the key hint
           therefore sits on its own line below rather than lengthening one
           column and pulling the row out of alignment. -->
        <form class="flex flex-wrap items-end gap-4" (submit)="save($event)">
          <div>
            <label appFieldLabel for="tier-label">
              {{ text.label }}
              <span class="text-accent" aria-hidden="true">*</span>
            </label>
            <input
              appInput
              size="sm"
              id="tier-label"
              name="label"
              class="w-56"
              autocomplete="off"
              [value]="draftLabel()"
              [placeholder]="text.labelPlaceholder"
              (input)="draftLabel.set($any($event.target).value)"
            />
          </div>
          <div>
            <label appFieldLabel for="tier-key">{{ text.key }}</label>
            <input
              appInput
              size="sm"
              id="tier-key"
              name="key"
              class="w-56 font-mono"
              autocomplete="off"
              [value]="draftKey()"
              [placeholder]="text.keyPlaceholder"
              (input)="draftKey.set($any($event.target).value)"
            />
          </div>
          <div class="flex items-center gap-2">
            <button
              appButton
              size="sm"
              type="submit"
              class="gap-2"
              [disabled]="busy()"
            >
              <app-admin-icon name="save" class="h-4 w-4" />
              {{ busy() ? common.saving : common.save }}
            </button>
            <button
              appButton
              variant="secondary"
              size="sm"
              type="button"
              class="gap-2"
              [disabled]="busy()"
              (click)="cancel()"
            >
              <app-admin-icon name="x" class="h-4 w-4" />
              {{ common.cancel }}
            </button>
          </div>
          <p class="w-full text-xs text-muted">{{ text.keyHint }}</p>
          @if (formError()) {
            <p class="w-full text-sm text-red-700" role="alert">
              {{ formError() }}
            </p>
          }
        </form>
      </ng-template>
    </div>
  `,
})
export class TierListPage {
  private readonly service = inject(TiersService);
  private readonly confirm = inject(ConfirmService);
  protected readonly text = inject(ADMIN_TEXT).tierList;
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly catalogText = inject(APP_TEXT).catalog;

  protected readonly tiers = resource({ loader: () => this.service.list() });
  protected readonly showSkeleton = delayedLoading(this.tiers.isLoading);

  /** Which row is open for editing — `{ id: null }` is the add form. */
  protected readonly editing = signal<EditTarget>(null);
  protected readonly draftLabel = signal('');
  protected readonly draftKey = signal('');
  protected readonly formError = signal<string | null>(null);
  /** A refusal that belongs to a row rather than the form — a blocked delete. */
  protected readonly rowError = signal<{ id: string; message: string } | null>(
    null,
  );
  protected readonly busy = signal(false);
  protected readonly reorderError = signal(false);

  /**
   * Moves a tier one place and commits immediately — the click *is* the save,
   * so there is nothing to confirm.
   */
  protected async move(from: number, to: number): Promise<void> {
    const current = this.tiers.value();
    if (!current || to < 0 || to >= current.tiers.length) return;

    const ordered = [...current.tiers];
    moveItemInArray(ordered, from, to);
    // Positions are re-numbered from zero on every drop: the numbers carry no
    // meaning of their own, only the sequence does.
    const order = ordered.map((tier, index) => ({
      id: tier.id,
      sortOrder: index,
    }));

    this.busy.set(true);
    this.reorderError.set(false);
    try {
      const tiers = await this.service.reorder({ order });
      this.tiers.set({ ...current, tiers });
    } catch {
      this.reorderError.set(true);
      this.tiers.reload();
    } finally {
      this.busy.set(false);
    }
  }

  protected isEditing(id: string | null): boolean {
    const target = this.editing();
    return target !== null && target.id === id;
  }

  protected accountsLabel(count: number): string {
    return this.text.accounts.replace('{count}', String(count));
  }

  protected pricesLabel(count: number): string {
    return this.text.prices.replace('{count}', String(count));
  }

  protected startAdd(): void {
    this.reset();
    this.editing.set({ id: null });
  }

  protected startEdit(tier: CustomerTier): void {
    this.reset();
    this.editing.set({ id: tier.id });
    this.draftLabel.set(tier.label);
    this.draftKey.set(tier.key);
  }

  protected cancel(): void {
    this.reset();
  }

  private reset(): void {
    this.editing.set(null);
    this.draftLabel.set('');
    this.draftKey.set('');
    this.formError.set(null);
    this.rowError.set(null);
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const target = this.editing();
    if (!target || this.busy()) return;

    const label = this.draftLabel().trim();
    const key = this.draftKey().trim();
    // Checked here as well as by the contract so a typo is answered on the spot
    // rather than by a 400 the user has to interpret.
    if (!label) return this.formError.set(this.text.labelRequired);
    if (!tierKeySchema.safeParse(key).success) {
      return this.formError.set(this.text.keyInvalid);
    }

    this.busy.set(true);
    this.formError.set(null);
    try {
      const result = target.id
        ? await this.service.update(target.id, { label, key })
        : await this.service.create({ label, key });
      if (result.ok) {
        this.reset();
        this.tiers.reload();
      } else {
        // Which refusal, in the deployment's own words — a duplicate sync key
        // is worth naming rather than a generic "could not save".
        this.formError.set(this.text.errors[result.code]);
      }
    } catch {
      this.formError.set(this.text.saveError);
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Deleting is refused while accounts or prices point at the tier. The counts
   * are already on screen, so say so instead of asking for a confirmation the
   * server is certain to reject.
   */
  protected async remove(tier: CustomerTier): Promise<void> {
    this.rowError.set(null);
    const reasons = [
      tier.userCount > 0 ? this.accountsLabel(tier.userCount) : null,
      tier.priceCount > 0 ? this.pricesLabel(tier.priceCount) : null,
    ].filter((r): r is string => r !== null);

    if (reasons.length > 0) {
      this.rowError.set({
        id: tier.id,
        message: this.text.deleteBlocked
          .replace('{name}', tier.label)
          .replace('{reason}', reasons.join(', ')),
      });
      return;
    }

    const confirmed = await this.confirm.ask({
      heading: this.text.deleteTitle,
      message: this.text.deleteConfirm
        .replace('{name}', tier.label)
        .replace('{key}', tier.key),
      confirmLabel: this.text.delete,
      cancelLabel: this.common.cancel,
    });
    if (!confirmed) return;

    this.busy.set(true);
    try {
      const result = await this.service.remove(tier.id);
      if (result.ok) {
        this.tiers.reload();
      } else {
        this.rowError.set({
          id: tier.id,
          message: this.text.errors[result.code],
        });
      }
    } catch {
      this.rowError.set({ id: tier.id, message: this.text.deleteError });
    } finally {
      this.busy.set(false);
    }
  }

  constructor() {
    usePageSeo({ name: () => this.text.title });
  }
}
