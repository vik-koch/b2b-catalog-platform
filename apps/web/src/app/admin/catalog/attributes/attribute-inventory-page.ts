import { Location, NgTemplateOutlet } from '@angular/common';
import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';

import { usePageSeo } from '../../../shared/core/page-seo';
import { useRowAnchor } from '../../../shared/core/row-anchor';
import { delayedLoading } from '../../../shared/core/delayed-loading';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { HintBadge } from '@b2b-catalog-platform/ui/content/hint-badge';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { ConfirmService } from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { RecordRow } from '@b2b-catalog-platform/ui/lists/record-row';
import { UnpublishedCount } from '../products/unpublished-count';
import { AttributesService } from './attributes.service';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { chevronDownIcon } from '@b2b-catalog-platform/ui/icons/glyphs/chevron-down';
import { chevronRightIcon } from '@b2b-catalog-platform/ui/icons/glyphs/chevron-right';
import { funnelIcon } from '@b2b-catalog-platform/ui/icons/glyphs/funnel';
import { pencilIcon } from '@b2b-catalog-platform/ui/icons/glyphs/pencil';
import { triangleAlertIcon } from '@b2b-catalog-platform/ui/icons/glyphs/triangle-alert';
import { PageHeader } from '@b2b-catalog-platform/ui/content/page-header';
import { SaveButton } from '../../ui/save-button';
import { CancelButton } from '../../ui/cancel-button';

/** A key across the catalog, or one value under a key. */
type RenameTarget =
  { kind: 'key'; key: string } | { kind: 'value'; key: string; value: string };

/**
 * Every attribute key and value in use (FR-ATTR-09). Text matches exactly, so
 * the alphabetical list puts a typo beside its correct spelling, and a rename
 * corrects every product at once. Products open in the product grid, filtered,
 * rather than in a second table here.
 */
@Component({
  selector: 'app-attribute-inventory-page',
  imports: [
    CancelButton,
    SaveButton,
    PageHeader,
    NgTemplateOutlet,
    RouterLink,
    Button,
    IconButton,
    Icon,
    Link,
    RecordRow,
    UnpublishedCount,
    HintBadge,
    Input,
    Skeleton,
    ErrorText,
  ],
  template: `
    <ui-page-header [title]="text.page.title" [intro]="text.page.intro">
      <a uiButton variant="secondary" routerLink="/admin/attributes">
        {{ text.toDefinitions }}
      </a>
    </ui-page-header>

    <div class="max-w-3xl">
      @if (keys.error()) {
        <p class="text-ink-subtle" role="alert">{{ adminText.loadError }}</p>
      } @else if (keys.hasValue()) {
        @if (keys.value().length === 0) {
          <p class="text-sm text-ink-subtle">{{ text.empty }}</p>
        } @else {
          <div class="border-y border-edge">
            <ul class="divide-y divide-edge">
              @for (entry of keys.value(); track entry.key) {
                <!-- scroll-mt clears the sticky header. -->
                <li [id]="rowId(entry.key)" class="scroll-mt-24">
                  <div class="py-3">
                    @if (isRenaming({ kind: 'key', key: entry.key })) {
                      <ng-container [ngTemplateOutlet]="form" />
                    } @else {
                      <ui-record-row [compact]="true">
                        <!-- Chevron and name are one button: split, their
                             shared hover lit the empty line beside the name. -->
                        <button
                          recordControl
                          type="button"
                          class="flex cursor-pointer items-center gap-2
                                 self-stretch text-left font-medium text-ink
                                 hover:text-accent"
                          [attr.aria-expanded]="expanded() === entry.key"
                          (click)="toggle(entry.key)"
                        >
                          <ui-icon
                            class="size-5 shrink-0 md:size-4"
                            [glyph]="
                              expanded() === entry.key
                                ? chevronDownIcon
                                : chevronRightIcon
                            "
                          />
                          {{ entry.key }}
                        </button>
                        <ng-container recordMeta>
                          <span>
                            @if (entry.productCount) {
                              <a
                                uiLink
                                routerLink="/admin/products"
                                [queryParams]="{ attributeKey: entry.key }"
                                [title]="text.showProducts"
                              >
                                {{ productsLabel(entry.productCount) }}
                              </a>
                              @if (entry.unpublishedProductCount) {
                                ·
                                <app-unpublished-count
                                  [count]="entry.unpublishedProductCount"
                                  [query]="{ attributeKey: entry.key }"
                                />
                              }
                            } @else {
                              {{ productsLabel(0) }}
                            }
                            ·
                            <button
                              uiLink
                              type="button"
                              [attr.aria-expanded]="expanded() === entry.key"
                              (click)="toggle(entry.key)"
                            >
                              {{ valuesLabel(entry.valueCount) }}
                            </button>
                          </span>
                        </ng-container>
                        <ng-container recordActions>
                          <!-- Deadened for a freetext key, not dropped: most
                               keys are freetext, and that is no fault to fix. -->
                          @if (entry.definition) {
                            <a
                              uiIconButton
                              routerLink="/admin/attributes"
                              [queryParams]="{ name: entry.key }"
                              [attr.aria-label]="text.toDefinitionAria"
                            >
                              <ui-icon [glyph]="funnelIcon" />
                            </a>
                          } @else {
                            <span
                              uiIconButton
                              class="pointer-events-none opacity-40"
                              [attr.aria-label]="text.notFilterable"
                              [title]="text.notFilterable"
                            >
                              <ui-icon [glyph]="funnelIcon" />
                            </span>
                          }
                          <button
                            uiIconButton
                            type="button"
                            [attr.aria-label]="text.renameKeyAria"
                            [disabled]="busy()"
                            (click)="
                              startRename({ kind: 'key', key: entry.key })
                            "
                          >
                            <ui-icon [glyph]="pencilIcon" />
                          </button>
                        </ng-container>
                      </ui-record-row>
                    }
                  </div>

                  @if (expanded() === entry.key) {
                    <!-- Tinted and indented like a subcategory in the tree. -->
                    <div class="border-t border-edge bg-surface ml-6 pl-2">
                      @if (values.error()) {
                        <p class="py-3 text-sm text-ink-subtle" role="alert">
                          {{ adminText.loadError }}
                        </p>
                      } @else if (values.hasValue()) {
                        <ul class="divide-y divide-edge">
                          @for (value of values.value(); track value.value) {
                            <li class="py-3">
                              @if (
                                isRenaming({
                                  kind: 'value',
                                  key: entry.key,
                                  value: value.value,
                                })
                              ) {
                                <ng-container [ngTemplateOutlet]="form" />
                              } @else {
                                <ui-record-row [compact]="true">
                                  <!-- An empty value is an old stored row;
                                       named, or it reads as a rendering fault. -->
                                  <span
                                    class="text-ink"
                                    [class.text-ink-subtle]="value.value === ''"
                                  >
                                    {{ value.value || text.emptyValue }}
                                  </span>
                                  <!-- It drops out of the number filter. -->
                                  @if (
                                    !value.numeric &&
                                    entry.definition?.type === 'number'
                                  ) {
                                    <ui-hint-badge
                                      recordBadge
                                      class="shrink-0"
                                      tone="warning"
                                      [label]="text.notNumeric"
                                    >
                                      <ui-icon
                                        [glyph]="triangleAlertIcon"
                                        class="size-3.5"
                                      />
                                    </ui-hint-badge>
                                  }
                                  <ng-container recordMeta>
                                    <span class="mr-7">
                                      @if (value.productCount) {
                                        <a
                                          uiLink
                                          routerLink="/admin/products"
                                          [queryParams]="{
                                            attributeKey: entry.key,
                                            attributeValue: value.value,
                                          }"
                                          [title]="text.showProducts"
                                        >
                                          {{
                                            productsLabel(value.productCount)
                                          }}
                                        </a>
                                        @if (value.unpublishedProductCount) {
                                          ·
                                          <app-unpublished-count
                                            [count]="
                                              value.unpublishedProductCount
                                            "
                                            [query]="{
                                              attributeKey: entry.key,
                                              attributeValue: value.value,
                                            }"
                                          />
                                        }
                                      } @else {
                                        {{ productsLabel(0) }}
                                      }
                                    </span>
                                  </ng-container>
                                  <ng-container recordActions>
                                    <button
                                      uiIconButton
                                      type="button"
                                      [attr.aria-label]="text.renameValueAria"
                                      [disabled]="busy()"
                                      (click)="
                                        startRename({
                                          kind: 'value',
                                          key: entry.key,
                                          value: value.value,
                                        })
                                      "
                                    >
                                      <ui-icon [glyph]="pencilIcon" />
                                    </button>
                                  </ng-container>
                                </ui-record-row>
                              }
                            </li>
                          }
                        </ul>
                      } @else {
                        <!-- The value rows themselves with bars for text, one
                             per known value, so nothing below moves when they
                             arrive. -->
                        <ul
                          class="animate-pulse divide-y divide-edge"
                          aria-hidden="true"
                        >
                          @for (
                            width of valuePlaceholders(entry.valueCount);
                            track $index
                          ) {
                            <li class="py-3">
                              <ui-record-row [compact]="true">
                                <!-- Each bar in a box the height of the line
                                     it stands in, or the row comes up short. -->
                                <span class="flex h-5 items-center">
                                  <span
                                    class="h-4 rounded-sm bg-skeleton"
                                    [style.width]="width"
                                  ></span>
                                </span>
                                <span
                                  recordMeta
                                  class="flex h-5 items-center mr-7"
                                >
                                  <span
                                    class="h-4 w-20 rounded-sm bg-skeleton"
                                  ></span>
                                </span>
                                <ng-container recordActions>
                                  <span uiIconButton>
                                    <span
                                      class="block size-(--icon-size)
                                             rounded-sm bg-skeleton"
                                    ></span>
                                  </span>
                                </ng-container>
                              </ui-record-row>
                            </li>
                          }
                        </ul>
                      }
                    </div>
                  }
                </li>
              }
            </ul>
          </div>
        }
      } @else if (showSkeleton()) {
        <ui-skeleton [lines]="6" />
      }

      @if (renameError()) {
        <p uiErrorText class="mt-4" role="alert">
          {{ renameError() }}
        </p>
      }

      <ng-template #form>
        <form
          class="flex flex-wrap items-end gap-3 py-0.25"
          (submit)="save($event)"
        >
          <input
            uiInput
            size="sm"
            class="w-72"
            name="rename"
            autocomplete="off"
            [attr.aria-label]="text.newTextAria"
            [value]="draft()"
            (input)="draft.set($any($event.target).value)"
          />
          <button
            uiButton
            appSaveButton
            size="sm"
            type="submit"
            [saving]="busy()"
          >
            {{ adminText.actions.save }}
          </button>
          <button
            uiButton
            variant="secondary"
            appCancelButton
            size="sm"
            type="button"
            [disabled]="busy()"
            (click)="cancel()"
          >
            {{ actionText.cancel }}
          </button>
        </form>
      </ng-template>
    </div>
  `,
})
export class AttributeInventoryPage {
  protected readonly chevronDownIcon = chevronDownIcon;
  protected readonly chevronRightIcon = chevronRightIcon;
  protected readonly funnelIcon = funnelIcon;
  protected readonly pencilIcon = pencilIcon;
  protected readonly triangleAlertIcon = triangleAlertIcon;
  private readonly service = inject(AttributesService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  protected readonly text = inject(ADMIN_TEXT).attributes.inventory;
  private readonly productsText = inject(ADMIN_TEXT).products;
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly actionText = inject(SHARED_TEXT).actions;

  protected readonly keys = resource({ loader: () => this.service.listKeys() });
  protected readonly showSkeleton = delayedLoading(this.keys.isLoading);

  /** The key that arrives open, from the URL: the product editor links here. */
  readonly key = input('');

  /**
   * One key open at a time, kept in the URL with `replaceState`, not by
   * navigating: every navigation scrolls to the top (`withInMemoryScrolling`).
   */
  protected readonly expanded = linkedSignal<string | null>(
    () => this.key() || null,
  );
  protected readonly values = resource({
    params: () => ({ key: this.expanded() }),
    loader: ({ params }) =>
      params.key ? this.service.listValues(params.key) : Promise.resolve([]),
  });

  protected readonly renaming = signal<RenameTarget | null>(null);
  protected readonly draft = signal('');
  protected readonly busy = signal(false);
  protected readonly renameError = signal<string | null>(null);

  /** Only whitespace goes: an id may hold anything else, and collapsing more
   * would let two keys collide. */
  protected rowId(key: string): string {
    return `attribute-${key.replace(/\s+/g, '_')}`;
  }

  protected toggle(key: string): void {
    this.cancel();
    this.open(this.expanded() === key ? null : key);
  }

  /** Replaces rather than pushes: opening a row is not a step to go back to. */
  private open(key: string | null): void {
    this.expanded.set(key);
    const tree = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams: { key },
      queryParamsHandling: 'merge',
    });
    this.location.replaceState(this.router.serializeUrl(tree));
  }

  protected isRenaming(target: RenameTarget): boolean {
    const current = this.renaming();
    if (!current || current.key !== target.key) return false;
    if (current.kind === 'key' || target.kind === 'key') {
      return current.kind === target.kind;
    }
    return current.value === target.value;
  }

  /** Cycling widths, so the bars read as different words, not a column. */
  protected valuePlaceholders(count: number): string[] {
    const widths = ['8rem', '5rem', '10rem'];
    return Array.from({ length: count }, (_, i) => widths[i % widths.length]);
  }

  protected productsLabel(count: number): string {
    return fillText(this.productsText.count, { count });
  }

  protected valuesLabel(count: number): string {
    return fillText(this.text.values, { count });
  }

  protected startRename(target: RenameTarget): void {
    this.renameError.set(null);
    this.renaming.set(target);
    this.draft.set(target.kind === 'key' ? target.key : target.value);
  }

  protected cancel(): void {
    this.renaming.set(null);
    this.draft.set('');
  }

  /** Renaming onto text in use merges the two, usually the point: the
   * confirmation says which it is about to do. */
  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const target = this.renaming();
    if (!target || this.busy()) return;

    const to = this.draft().trim();
    const from = target.kind === 'key' ? target.key : target.value;
    if (!to || to === from) return this.cancel();

    const merges = this.existingTexts(target).includes(to);
    // A restored product must carry the new text, so the rename reaches the
    // deleted ones too and says so (FR-ADM-22).
    const deleted = this.deletedCarrying(target);
    const confirmed = await this.confirm.ask({
      heading: this.text.renameTitle,
      message: [
        fillText(merges ? this.text.mergeConfirm : this.text.renameConfirm, {
          from: from || this.text.emptyValue,
          to,
        }),
        deleted ? fillText(this.text.renameDeleted, { count: deleted }) : '',
      ]
        .filter(Boolean)
        .join(' '),
      confirmLabel: this.adminText.actions.save,
      cancelLabel: this.actionText.cancel,
    });
    if (!confirmed) return;

    this.busy.set(true);
    this.renameError.set(null);
    try {
      if (target.kind === 'key') {
        await this.service.renameKey({ from, to });
        // The key the values were listed under is gone; follow it.
        if (this.expanded() === from) this.open(to);
      } else {
        await this.service.renameValue({ key: target.key, from, to });
        this.values.reload();
      }
      this.cancel();
      this.keys.reload();
    } catch {
      this.renameError.set(this.text.renameError);
    } finally {
      this.busy.set(false);
    }
  }

  /** How many deleted products carry what is being renamed. */
  private deletedCarrying(target: RenameTarget): number {
    if (target.kind === 'key') {
      return (
        (this.keys.value() ?? []).find((entry) => entry.key === target.key)
          ?.deletedProductCount ?? 0
      );
    }
    return (
      (this.values.value() ?? []).find((value) => value.value === target.value)
        ?.deletedProductCount ?? 0
    );
  }

  /** The texts a rename could collide with: its siblings in the same list. */
  private existingTexts(target: RenameTarget): string[] {
    if (target.kind === 'key') {
      return (this.keys.value() ?? []).map((entry) => entry.key);
    }
    return (this.values.value() ?? []).map((value) => value.value);
  }

  constructor() {
    usePageSeo({ name: () => this.text.page.title });
    // Land on the row, not merely open it somewhere below.
    useRowAnchor(
      computed(() => (this.key() ? this.rowId(this.key()) : null)),
      computed(() => this.keys.hasValue()),
    );
  }
}
