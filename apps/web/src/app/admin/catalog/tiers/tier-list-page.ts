import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, resource, signal } from '@angular/core';
import { disabled, form, validate } from '@angular/forms/signals';
import { fillText } from '@b2b-catalog-platform/shared';
import { TIER_KEY_MAX_LENGTH } from '@b2b-catalog-platform/shared/core/catalog';
import {
  CustomerTier,
  TIER_KEY_PATTERN,
} from '@b2b-catalog-platform/shared/admin/catalog';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { usePageSeo } from '../../../shared/core/page-seo';
import { delayedLoading } from '../../../shared/core/delayed-loading';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { filled } from '../../../shared/core/field-rules';
import { FORM_FIELDS } from '@b2b-catalog-platform/ui/fields/form-fields';
import { submitAttempt } from '@b2b-catalog-platform/ui/fields/submit-attempt';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { ConfirmService } from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { RecordFields } from '@b2b-catalog-platform/ui/lists/record-fields';
import { RecordFormActions } from '@b2b-catalog-platform/ui/lists/record-form-actions';
import { RecordRow } from '@b2b-catalog-platform/ui/lists/record-row';
import { LockedFieldMarker } from '../../ownership/locked-field-marker';
import { SettingsService } from '../../settings/settings.service';
import { TiersService } from './tiers.service';
import { RouterLink } from '@angular/router';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { Hint } from '@b2b-catalog-platform/ui/fields/hint';
import { eyeIcon } from '@b2b-catalog-platform/ui/icons/glyphs/eye';
import { gripVerticalIcon } from '@b2b-catalog-platform/ui/icons/glyphs/grip-vertical';
import { pencilIcon } from '@b2b-catalog-platform/ui/icons/glyphs/pencil';
import { plusIcon } from '@b2b-catalog-platform/ui/icons/glyphs/plus';
import { saveIcon } from '@b2b-catalog-platform/ui/icons/glyphs/save';
import { trash2Icon } from '@b2b-catalog-platform/ui/icons/glyphs/trash-2';
import { xIcon } from '@b2b-catalog-platform/ui/icons/glyphs/x';
import { PageHeader } from '@b2b-catalog-platform/ui/content/page-header';

/** The row currently in edit mode: an existing tier's id, or the new-tier form. */
type EditTarget = { id: string } | { id: null } | null;

/**
 * The price lists (FR-AUTH-05). A tier is two fields, so rows edit in place
 * and the add form is the same markup, empty. The storefront's list is an
 * ordinary row with a badge: it cannot be deleted, and its account count is
 * the customers with no tier.
 */
@Component({
  selector: 'app-tier-list-page',
  imports: [
    PageHeader,
    FORM_FIELDS,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    NgTemplateOutlet,
    Button,
    IconButton,
    Icon,
    Link,
    RecordRow,
    RecordFields,
    RecordFormActions,
    LockedFieldMarker,
    Input,
    Skeleton,
    RouterLink,
    ErrorText,
    Hint,
  ],
  template: `
    <ui-page-header [title]="text.page.title" [intro]="text.page.intro">
      <button
        uiButton
        type="button"
        class="gap-2"
        [disabled]="editing() !== null"
        (click)="startAdd()"
      >
        <ui-icon [glyph]="plusIcon" class="size-4" />
        {{ text.add }}
      </button>
    </ui-page-header>

    <div class="max-w-3xl">
      @if (reorderError()) {
        <p uiErrorText class="mb-4" role="alert">
          {{ text.reorderError }}
        </p>
      }

      @if (tiers.error()) {
        <p class="text-ink-subtle" role="alert">{{ adminText.loadError }}</p>
      } @else if (tiers.hasValue()) {
        <!-- Rules, not a card: the same record list an admin grid draws on a
             phone. -->
        <div class="divide-y divide-edge border-y border-edge">
          <ul
            class="divide-y divide-edge"
            cdkDropList
            [cdkDropListDisabled]="busy() || editing() !== null"
            (cdkDropListDropped)="onDrop($event)"
          >
            @for (tier of tiers.value().tiers; track tier.id) {
              <li class="py-3" cdkDrag [cdkDragData]="tier">
                @if (isEditing(tier.id)) {
                  <ng-container [ngTemplateOutlet]="recordForm" />
                } @else {
                  <ui-record-row [compact]="true">
                    <span
                      recordControl
                      cdkDragHandle
                      uiIconButton
                      size="lead"
                      class="cursor-grab active:cursor-grabbing"
                      [attr.aria-label]="adminText.actions.reorder"
                      [title]="adminText.actions.reorder"
                    >
                      <ui-icon [glyph]="gripVerticalIcon" />
                    </span>
                    <span class="font-medium text-ink">{{ tier.label }}</span>
                    <code class="rounded-sm bg-surface px-1.5 py-0.5 text-xs">
                      {{ tier.key }}
                    </code>
                    @if (tier.isDefault) {
                      <span
                        class="rounded-sm bg-ink-subtle px-1.5 py-0.5 text-xs
                               text-white"
                        [title]="text.defaultHint"
                      >
                        {{ text.defaultBadge }}
                      </span>
                    }
                    <ng-container recordMeta>
                      <span>
                        @if (tier.priceCount) {
                          <a
                            uiLink
                            routerLink="/admin/products"
                            [queryParams]="{ tierId: tier.id }"
                            [title]="text.seePrices"
                          >
                            {{ pricesLabel(tier.priceCount) }}
                          </a>
                        } @else {
                          {{ pricesLabel(0) }}
                        }
                        <!-- On the storefront's list these cannot be
                             published; on any other they are charged the
                             storefront price. -->
                        @if (unpricedCount(tier); as missing) {
                          ·
                          <a
                            uiLink
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
                      @if (!tier.isDefault) {
                        <button
                          uiIconButton
                          type="button"
                          [attr.aria-label]="text.setDefault"
                          [title]="text.setDefault"
                          [disabled]="busy() || editing() !== null"
                          (click)="makeDefault(tier)"
                        >
                          <ui-icon [glyph]="eyeIcon" />
                        </button>
                      } @else {
                        <!-- Keeps the place, so this row's buttons line up
                             with the others. -->
                        <span aria-hidden="true" class="inline-flex p-2 sm:p-1">
                          <span class="block size-5 sm:size-4"></span>
                        </span>
                      }
                      <button
                        uiIconButton
                        type="button"
                        [attr.aria-label]="adminText.actions.edit"
                        [disabled]="editing() !== null"
                        (click)="startEdit(tier)"
                      >
                        <ui-icon [glyph]="pencilIcon" />
                      </button>
                      <!-- On the storefront's list too: it explains why
                           rather than vanishing. -->
                      <button
                        uiIconButton
                        variant="danger"
                        type="button"
                        [attr.aria-label]="adminText.actions.delete"
                        [disabled]="busy()"
                        (click)="remove(tier)"
                      >
                        <ui-icon [glyph]="trash2Icon" />
                      </button>
                    </ng-container>
                  </ui-record-row>
                  @if (rowError()?.id === tier.id) {
                    <p uiErrorText class="mt-2" role="alert">
                      {{ rowError()?.message }}
                    </p>
                  }
                }
              </li>
            }
          </ul>

          @if (isEditing(null)) {
            <div class="py-3">
              <ng-container [ngTemplateOutlet]="recordForm" />
            </div>
          } @else if (tiers.value().tiers.length === 0) {
            <p class="py-3 text-sm text-ink-subtle">{{ text.empty }}</p>
          }
        </div>
      } @else if (showSkeleton()) {
        <ui-skeleton [lines]="4" />
      }

      <ng-template #accounts let-count let-tier="tier">
        @if (count) {
          <a
            uiLink
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

      <ng-template #recordForm>
        <form uiRecordFields [formRoot]="form" (submit)="save()">
          <ui-field
            [field]="form.label"
            [label]="text.label"
            controlId="tier-label"
          >
            <input
              uiInput
              size="sm"
              class="w-full"
              autocomplete="off"
              [placeholder]="text.labelPlaceholder"
              [formField]="form.label"
            />
          </ui-field>
          <ui-field [field]="form.key" [label]="text.key" controlId="tier-key">
            <app-locked-field-marker uiFieldCaption [field]="form.key" />
            <input
              uiInput
              size="sm"
              class="w-full font-mono"
              autocomplete="off"
              [placeholder]="text.keyPlaceholder"
              [formField]="form.key"
            />
          </ui-field>
          <p uiHint class="sm:col-span-2">
            {{ keyLocked() ? ownershipText.tierKeyLocked : text.keyHint }}
          </p>
          <div uiRecordFormActions>
            <button
              uiButton
              size="sm"
              type="submit"
              class="gap-2"
              [disabled]="busy()"
            >
              <ui-icon [glyph]="saveIcon" class="size-4" />
              {{ busy() ? actionText.saving : adminText.actions.save }}
            </button>
            <button
              uiButton
              variant="secondary"
              size="sm"
              type="button"
              class="gap-2"
              [disabled]="busy()"
              (click)="cancel()"
            >
              <ui-icon [glyph]="xIcon" class="size-4" />
              {{ actionText.cancel }}
            </button>
          </div>
          @if (formError()) {
            <p uiErrorText class="sm:col-span-2" role="alert">
              {{ formError() }}
            </p>
          }
        </form>
      </ng-template>
    </div>
  `,
})
export class TierListPage {
  protected readonly eyeIcon = eyeIcon;
  protected readonly gripVerticalIcon = gripVerticalIcon;
  protected readonly pencilIcon = pencilIcon;
  protected readonly plusIcon = plusIcon;
  protected readonly saveIcon = saveIcon;
  protected readonly trash2Icon = trash2Icon;
  protected readonly xIcon = xIcon;
  private readonly service = inject(TiersService);
  private readonly confirm = inject(ConfirmService);
  private readonly settings = inject(SettingsService);
  protected readonly text = inject(ADMIN_TEXT).tiers;
  private readonly productsText = inject(ADMIN_TEXT).products;
  protected readonly ownershipText = inject(ADMIN_TEXT).ownership;
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly actionText = inject(SHARED_TEXT).actions;

  protected readonly tiers = resource({ loader: () => this.service.list() });
  protected readonly showSkeleton = delayedLoading(this.tiers.isLoading);

  /** `{ id: null }` is the add form. */
  protected readonly editing = signal<EditTarget>(null);
  private readonly draft = signal({ label: '', key: '' });
  protected readonly form = form(
    this.draft,
    (tier) => {
      filled(tier.label, this.text.labelRequired);
      filled(tier.key, this.text.keyInvalid);
      disabled(tier.key, {
        when: () => this.keyLocked() && this.ownershipText.fieldLockedShort,
      });
      // The contract's rule, from its import-free parts.
      validate(tier.key, ({ value }) => {
        const key = value().trim().normalize('NFC');
        return !key ||
          (key.length <= TIER_KEY_MAX_LENGTH && TIER_KEY_PATTERN.test(key))
          ? undefined
          : { kind: 'key', message: this.text.keyInvalid };
      });
    },
    { name: 'tier' },
  );
  protected readonly formError = signal<string | null>(null);
  /** A refusal that belongs to a row rather than the form: a blocked delete. */
  protected readonly rowError = signal<{ id: string; message: string } | null>(
    null,
  );
  protected readonly busy = signal(false);
  protected readonly reorderError = signal(false);

  /**
   * Only an existing list's key locks while the catalog is owned (FR-ADM-10):
   * it is the source's handle on the list. A new list has none yet, so adding
   * one is how an admin answers a run that priced an unknown key.
   */
  protected readonly keyLocked = computed(
    () =>
      this.editing()?.id != null &&
      (this.settings.ownedAreas()?.includes('catalog') ?? false),
  );

  /** The drop is the save, so there is nothing to confirm. */
  protected onDrop(event: CdkDragDrop<CustomerTier>): void {
    if (event.previousIndex === event.currentIndex) return;
    void this.move(event.previousIndex, event.currentIndex);
  }

  private async move(from: number, to: number): Promise<void> {
    const current = this.tiers.value();
    if (!current || to < 0 || to >= current.tiers.length) return;

    const ordered = [...current.tiers];
    moveItemInArray(ordered, from, to);
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

  /** The confirmation names the cost first: the products the new list does
   * not price come off the storefront. */
  protected async makeDefault(tier: CustomerTier): Promise<void> {
    this.rowError.set(null);
    const confirmed = await this.confirm.ask({
      heading: this.text.setDefaultConfirm.heading,
      message: [
        fillText(this.text.setDefaultConfirm.message, { name: tier.label }),
        tier.wouldUnpublish > 0
          ? fillText(this.text.setDefaultWarning, {
              count: tier.wouldUnpublish,
            })
          : this.text.setDefaultNone,
      ].join(' '),
      confirmLabel: this.text.setDefaultConfirm.confirm,
      cancelLabel: this.text.setDefaultConfirm.cancel ?? this.actionText.cancel,
    });
    if (!confirmed) return;

    this.busy.set(true);
    try {
      const { tiers, productCount, unpublished } =
        await this.service.setDefault(tier.id);
      this.tiers.set({ tiers, productCount });
      if (unpublished > 0) {
        this.rowError.set({
          id: tier.id,
          message: fillText(this.text.setDefaultDone, { count: unpublished }),
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
    return fillText(this.text.accounts, { count });
  }

  protected pricesLabel(count: number): string {
    return fillText(this.productsText.count, { count });
  }

  protected unpricedLabel(count: number): string {
    return fillText(this.text.unpriced, { count });
  }

  /** The live products this list does not price. */
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
    this.draft.set({ label: tier.label, key: tier.key });
  }

  protected cancel(): void {
    this.reset();
  }

  private reset(): void {
    this.editing.set(null);
    this.draft.set({ label: '', key: '' });
    // The next row opened starts quiet, not red from this one's attempt.
    submitAttempt(this.form).set(false);
    this.formError.set(null);
    this.rowError.set(null);
  }

  protected async save(): Promise<void> {
    const target = this.editing();
    if (!target || this.busy() || this.form().invalid()) return;

    const label = this.draft().label.trim();
    const key = this.draft().key.trim();

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
        this.formError.set(this.text.errors[result.code]);
      }
    } catch {
      this.formError.set(this.text.saveError);
    } finally {
      this.busy.set(false);
    }
  }

  /** The server's refusals, said from what the row already knows instead of
   * asking for a confirmation it would reject. */
  protected async remove(tier: CustomerTier): Promise<void> {
    this.rowError.set(null);
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
        message: fillText(this.text.deleteBlocked, {
          name: tier.label,
          reason: reasons.join(', '),
        }),
      });
      return;
    }

    const confirmed = await this.confirm.ask({
      heading: this.text.deleteConfirm.heading,
      message: fillText(this.text.deleteConfirm.message, {
        name: tier.label,
        key: tier.key,
      }),
      confirmLabel: this.text.deleteConfirm.confirm,
      cancelLabel: this.text.deleteConfirm.cancel ?? this.actionText.cancel,
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
    usePageSeo({ name: () => this.text.page.title });
    void this.settings.load();
  }
}
