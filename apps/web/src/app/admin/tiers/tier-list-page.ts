import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, resource, signal } from '@angular/core';
import { CustomerTier, tierKeySchema } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { APP_TEXT } from '../../config/app-text';
import { usePageSeo } from '../../core/page-seo';
import { delayedLoading } from '../../core/delayed-loading';
import { Button } from '../../ui/button';
import { IconButton } from '../../ui/icon-button';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Link } from '../../ui/link';
import { Input } from '../../ui/input';
import { FieldLabel } from '../../ui/field-label';
import { Skeleton } from '../../ui/skeleton';
import { ConfirmService } from '../../ui/confirm.service';
import { RecordFields, RecordFormActions } from '../records/record-form';
import { RecordRow } from '../records/record-row';
import { LockedFieldMarker } from '../ownership/locked-field-marker';
import { SettingsService } from '../settings/settings.service';
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
 * Every list is a row here, the one the storefront quotes included: it is an
 * ordinary tier carrying a badge, renamed, rekeyed and priced like the rest.
 * Only two things separate it — it cannot be deleted, because every read path
 * resolves a price through it, and its account count is the customers with no
 * tier at all, which is the same state a guest is in.
 */
@Component({
  selector: 'app-tier-list-page',
  imports: [
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    NgTemplateOutlet,
    Button,
    IconButton,
    AdminIcon,
    Link,
    RecordRow,
    RecordFields,
    RecordFormActions,
    LockedFieldMarker,
    Input,
    FieldLabel,
    Skeleton,
    RouterLink,
  ],
  template: `
    <div class="mb-4 flex items-start justify-between gap-4">
      <h1 class="text-3xl font-medium tracking-tight">{{ text.title }}</h1>
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

    <p class="mb-6 max-w-3xl text-sm text-muted">{{ text.intro }}</p>

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
        <!-- Divided rules on the page, not a card: this is the same list of
             records an admin grid draws on a phone, and two lists in one panel
             that frame themselves differently read as two tools. -->
        <div class="divide-y divide-border border-y border-border">
          <ul
            class="divide-y divide-border"
            cdkDropList
            [cdkDropListDisabled]="busy() || editing() !== null"
            (cdkDropListDropped)="onDrop($event)"
          >
            @for (tier of tiers.value().tiers; track tier.id) {
              <li class="py-3" cdkDrag [cdkDragData]="tier">
                @if (isEditing(tier.id)) {
                  <ng-container [ngTemplateOutlet]="form" />
                } @else {
                  <app-record-row [compact]="true">
                    <!-- A handle, not a pair of step buttons: everything else
                         in the panel that has an order is dragged, and a button
                         that disables itself at the ends of the list flickers
                         through every reorder. -->
                    <span
                      recordControl
                      cdkDragHandle
                      appIconButton
                      size="lead"
                      class="cursor-grab active:cursor-grabbing"
                      [attr.aria-label]="common.reorder"
                      [title]="common.reorder"
                    >
                      <app-admin-icon name="grip-vertical" />
                    </span>
                    <span class="font-medium text-stone-700">{{
                      tier.label
                    }}</span>
                    <!-- The sync key beside the label it belongs to, not across
                         the row: it is this tier's identifier, and read as a
                         pair with the name it identifies. -->
                    <code class="rounded bg-stone-100 px-1.5 py-0.5 text-xs">
                      {{ tier.key }}
                    </code>
                    @if (tier.isDefault) {
                      <span
                        class="rounded bg-stone-700 px-1.5 py-0.5 text-xs text-white"
                        [title]="text.defaultHint"
                      >
                        {{ text.defaultBadge }}
                      </span>
                    }
                    <!-- Both counts are the ways out of the row: the accounts
                         on this tier, and the products it prices — the second
                         is what the glyph at the other end used to open, said
                         as the figure itself. Dead where the tier prices
                         nothing: that it is dead is the answer. -->
                    <ng-container recordMeta>
                      <span>
                        @if (tier.priceCount) {
                          <a
                            appLink
                            routerLink="/admin/products"
                            [queryParams]="{ tierId: tier.id }"
                            [title]="text.seePrices"
                          >
                            {{ pricesLabel(tier.priceCount) }}
                          </a>
                        } @else {
                          {{ pricesLabel(0) }}
                        }
                        <!-- The other side of that count: what this list does
                             not price. On the storefront's list those are the
                             products nobody can publish; on any other they are
                             the ones charged the storefront price. -->
                        @if (unpricedCount(tier); as missing) {
                          ·
                          <a
                            appLink
                            routerLink="/admin/products"
                            [queryParams]="{
                              tierId: tier.id,
                              tierPriced: 'no',
                            }"
                            [title]="text.seeUnpriced"
                          >
                            {{ unpricedLabel(missing) }}
                          </a>
                        }
                        ·
                        <ng-container
                          [ngTemplateOutlet]="accounts"
                          [ngTemplateOutletContext]="{
                            $implicit: tier.userCount,
                            tier: tier.id,
                          }"
                        />
                      </span>
                    </ng-container>
                    <ng-container recordActions>
                      <!-- Only on a list that is not already the storefront's:
                           there is nowhere for the badge to go from there. -->
                      @if (!tier.isDefault) {
                        <button
                          appIconButton
                          type="button"
                          [attr.aria-label]="text.setDefault"
                          [title]="text.setDefault"
                          [disabled]="busy() || editing() !== null"
                          (click)="makeDefault(tier)"
                        >
                          <app-admin-icon name="eye" />
                        </button>
                      } @else {
                        <!-- The badged list keeps the place rather than the
                             control: with the glyph simply gone its row's
                             buttons — and the counts they push against — sit a
                             glyph's width off every other row in the list. -->
                        <span aria-hidden="true" class="inline-flex p-2 sm:p-1">
                          <span class="block size-5 sm:size-4"></span>
                        </span>
                      }
                      <button
                        appIconButton
                        type="button"
                        [attr.aria-label]="text.edit"
                        [disabled]="editing() !== null"
                        (click)="startEdit(tier)"
                      >
                        <app-admin-icon name="pencil" />
                      </button>
                      <!-- Present on the storefront's list too, and it
                           explains rather than disappears: a control that is
                           simply absent leaves the admin wondering whether the
                           page is broken. -->
                      <button
                        appIconButton
                        variant="danger"
                        type="button"
                        [attr.aria-label]="text.delete"
                        [disabled]="busy()"
                        (click)="remove(tier)"
                      >
                        <app-admin-icon name="trash-2" />
                      </button>
                    </ng-container>
                  </app-record-row>
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
            <div class="py-3">
              <ng-container [ngTemplateOutlet]="form" />
            </div>
          } @else if (tiers.value().tiers.length === 0) {
            <p class="py-3 text-sm text-muted">{{ text.empty }}</p>
          }
        </div>
      } @else if (showSkeleton()) {
        <app-skeleton [lines]="4" />
      }

      <!-- One form for both add and edit: a tier is a name and a key either way,
         and the only difference is which request the save makes. -->
      <!-- How many accounts sit on a price list, and the way to them. The
           base list says it too: it is a list like any other here, and the
           only one nobody can edit. -->
      <ng-template #accounts let-count let-tier="tier">
        @if (count) {
          <a
            appLink
            routerLink="/admin/users"
            [queryParams]="{ tier }"
            [title]="text.seeAccounts"
          >
            {{ accountsLabel(count) }}
          </a>
        } @else {
          {{ accountsLabel(0) }}
        }
      </ng-template>

      <ng-template #form>
        <!-- The label and the sync key it is stored under, side by side from
             sm up and one per line below it — the same two-column form the
             filterable attributes wear. -->
        <form appRecordFields (submit)="save($event)">
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
              class="w-full"
              autocomplete="off"
              [value]="draftLabel()"
              [placeholder]="text.labelPlaceholder"
              (input)="draftLabel.set($any($event.target).value)"
            />
          </div>
          <div>
            <!-- Locked only on an existing list, and only while the catalog is
                 managed elsewhere: the key is that system's handle on this
                 list. A list being added has no handle yet, so the add form
                 keeps the field — it is how an admin answers a run that priced
                 a key this deployment does not have. -->
            <label appFieldLabel for="tier-key">
              {{ text.key }}
              @if (keyLocked()) {
                <app-locked-field-marker />
              }
            </label>
            <input
              appInput
              size="sm"
              id="tier-key"
              name="key"
              class="w-full font-mono"
              autocomplete="off"
              [value]="draftKey()"
              [disabled]="keyLocked()"
              [placeholder]="text.keyPlaceholder"
              (input)="draftKey.set($any($event.target).value)"
            />
          </div>
          <p class="text-xs text-muted sm:col-span-2">
            {{ keyLocked() ? ownershipText.tierKeyLocked : text.keyHint }}
          </p>
          <div appRecordFormActions>
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
          @if (formError()) {
            <p class="text-sm text-red-700 sm:col-span-2" role="alert">
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
  private readonly settings = inject(SettingsService);
  protected readonly text = inject(ADMIN_TEXT).tierList;
  protected readonly ownershipText = inject(ADMIN_TEXT).ownership;
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
   * The sync key of a list that already exists, while an external system owns
   * the catalog (FR-ADM-10). Nothing else on this screen locks: the label is
   * what staff read, the order is display only, and adding or dropping a list
   * writes no price.
   */
  protected readonly keyLocked = computed(
    () =>
      this.editing()?.id != null &&
      (this.settings.ownedAreas()?.includes('catalog') ?? false),
  );

  /**
   * Moves a tier one place and commits immediately — the click *is* the save,
   * so there is nothing to confirm.
   */
  /**
   * Moves a tier one place and commits immediately — the drop *is* the save,
   * so there is nothing to confirm.
   */
  protected onDrop(event: CdkDragDrop<CustomerTier>): void {
    if (event.previousIndex === event.currentIndex) return;
    void this.move(event.previousIndex, event.currentIndex);
  }

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

  /**
   * Moves the storefront's badge onto one list. The confirmation names what it
   * costs first: products the new list does not price come off the storefront,
   * and that figure is already on the row.
   */
  protected async makeDefault(tier: CustomerTier): Promise<void> {
    this.rowError.set(null);
    const confirmed = await this.confirm.ask({
      heading: this.text.setDefaultTitle,
      message: [
        this.text.setDefaultConfirm.replace('{name}', tier.label),
        tier.wouldUnpublish > 0
          ? this.text.setDefaultWarning.replace(
              '{count}',
              String(tier.wouldUnpublish),
            )
          : this.text.setDefaultNone,
      ].join(' '),
      confirmLabel: this.text.setDefault,
      cancelLabel: this.common.cancel,
    });
    if (!confirmed) return;

    this.busy.set(true);
    try {
      const { tiers, productCount, unpublished } =
        await this.service.setDefault(tier.id);
      // The move answers with the whole list, counts and badge included, so
      // the screen takes it rather than asking for it again.
      this.tiers.set({ tiers, productCount });
      if (unpublished > 0) {
        // Said afterwards as well: an admin who accepted the figure is owed
        // the confirmation that it is what happened.
        this.rowError.set({
          id: tier.id,
          message: this.text.setDefaultDone.replace(
            '{count}',
            String(unpublished),
          ),
        });
      }
    } catch {
      this.rowError.set({ id: tier.id, message: this.text.setDefaultError });
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

  protected unpricedLabel(count: number): string {
    return this.text.unpriced.replace('{count}', String(count));
  }

  /**
   * How many live products this list does not price — the gap behind its own
   * count. Two server figures subtracted rather than a third query: the list
   * already carries both, and they are read together on the row.
   */
  protected unpricedCount(tier: CustomerTier): number {
    const total = this.tiers.value()?.productCount ?? 0;
    return Math.max(total - tier.priceCount, 0);
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
    // The same refusal the server makes, said here because the row already
    // knows: this is the list the storefront quotes, and it is moved, never
    // removed.
    if (tier.isDefault) {
      this.rowError.set({
        id: tier.id,
        message: this.text.errors['tier-is-default'],
      });
      return;
    }

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
    void this.settings.load();
  }
}
