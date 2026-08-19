import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ADMIN_TEXT } from '../../config/admin-text';
import { APP_TEXT } from '../../config/app-text';
import { usePageSeo } from '../../core/page-seo';
import { delayedLoading } from '../../core/delayed-loading';
import { Button } from '../../ui/button';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Input } from '../../ui/input';
import { Skeleton } from '../../ui/skeleton';
import { ConfirmService } from '../../ui/confirm.service';
import { AttributesService } from './attributes.service';

/** What is being renamed: a key across the catalog, or one value under a key. */
type RenameTarget =
  | { kind: 'key'; key: string }
  | { kind: 'value'; key: string; value: string };

/**
 * The attribute inventory (FR-ATTR-09) — every key and value in use across the
 * catalog, declared or freetext, with the products behind each.
 *
 * This screen exists because attribute text is matched exactly and nothing is
 * normalized beyond trimming: "Colour" and "colour" are two attributes and
 * stay that way until somebody says otherwise. Listing them alphabetically
 * puts a typo next to its correct spelling, and the rename beside it is the
 * correction — one statement across the catalog rather than forty product
 * saves.
 *
 * Drilling into products deliberately leaves this page for the admin product
 * list, filtered: a second table here would arrive without its search, sort,
 * pagination and row actions.
 */
@Component({
  selector: 'app-attribute-inventory-page',
  imports: [NgTemplateOutlet, RouterLink, Button, AdminIcon, Input, Skeleton],
  template: `
    <div class="mb-4 flex items-center justify-between gap-4">
      <h1 class="text-3xl font-bold tracking-tight">{{ text.title }}</h1>
      <a appButton variant="secondary" routerLink="/admin/attributes">
        {{ text.toDefinitions }}
      </a>
    </div>

    <p class="mb-6 max-w-2xl text-sm text-muted">{{ text.intro }}</p>

    @if (keys.error()) {
      <p class="text-muted" role="alert">{{ catalogText.loadError }}</p>
    } @else if (keys.hasValue()) {
      @if (keys.value().length === 0) {
        <p class="text-sm text-muted">{{ text.empty }}</p>
      } @else {
        <div class="overflow-hidden rounded-lg border border-border">
          <ul class="divide-y divide-border">
            @for (entry of keys.value(); track entry.key) {
              <li>
                <div class="p-4">
                  @if (isRenaming({ kind: 'key', key: entry.key })) {
                    <ng-container [ngTemplateOutlet]="form" />
                  } @else {
                    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <button
                        type="button"
                        class="flex items-center gap-2 font-medium text-stone-700 hover:text-accent"
                        [attr.aria-expanded]="expanded() === entry.key"
                        (click)="toggle(entry.key)"
                      >
                        <app-admin-icon
                          [name]="
                            expanded() === entry.key
                              ? 'chevron-down'
                              : 'chevron-right'
                          "
                          class="h-4 w-4"
                        />
                        {{ entry.key }}
                      </button>
                      <!-- Whether the shop filters by it. A freetext key is not
                           a problem to be fixed — most attributes are — so this
                           states the fact and offers the registry, nothing
                           more. -->
                      @if (entry.definition) {
                        <span
                          class="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-subtle"
                        >
                          {{ text.filterable }}
                        </span>
                      }
                      <span class="text-sm text-subtle">
                        {{ productsLabel(entry.productCount) }} ·
                        {{ valuesLabel(entry.valueCount) }}
                      </span>
                      <span class="ml-auto flex items-center gap-1">
                        <a
                          class="p-1 text-stone-400 hover:text-accent"
                          routerLink="/admin/products"
                          [queryParams]="{ attributeKey: entry.key }"
                          [attr.aria-label]="text.showProducts"
                        >
                          <app-admin-icon name="square-menu" class="h-4 w-4" />
                        </a>
                        <button
                          type="button"
                          class="p-1 text-stone-400 hover:text-accent"
                          [attr.aria-label]="text.renameKey"
                          [disabled]="busy()"
                          (click)="startRename({ kind: 'key', key: entry.key })"
                        >
                          <app-admin-icon name="pencil" class="h-4 w-4" />
                        </button>
                      </span>
                    </div>
                  }
                </div>

                @if (expanded() === entry.key) {
                  <!-- Values sit inside their key's row rather than on a screen
                       of their own: the comparison that matters is between two
                       spellings of one attribute. -->
                  <div class="border-t border-border bg-stone-50 px-4">
                    @if (values.error()) {
                      <p class="py-3 text-sm text-muted" role="alert">
                        {{ catalogText.loadError }}
                      </p>
                    } @else if (values.hasValue()) {
                      <ul class="divide-y divide-border">
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
                              <div
                                class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                              >
                                <!-- An empty value is a row stored before
                                     valueless attributes stopped being saved.
                                     Named, or it reads as a rendering fault. -->
                                <span
                                  class="text-stone-700"
                                  [class.text-muted]="value.value === ''"
                                >
                                  {{ value.value || text.emptyValue }}
                                </span>
                                <span class="text-subtle">
                                  {{ productsLabel(value.productCount) }}
                                </span>
                                <!-- Only worth saying where it costs something:
                                     a value with no numeric form drops out of a
                                     number attribute's filter. -->
                                @if (
                                  !value.numeric &&
                                  entry.definition?.type === 'number'
                                ) {
                                  <span class="text-amber-700">
                                    {{ text.notNumeric }}
                                  </span>
                                }
                                <span class="ml-auto flex items-center gap-1">
                                  <a
                                    class="p-1 text-stone-400 hover:text-accent"
                                    routerLink="/admin/products"
                                    [queryParams]="{
                                      attributeKey: entry.key,
                                      attributeValue: value.value,
                                    }"
                                    [attr.aria-label]="text.showProducts"
                                  >
                                    <app-admin-icon
                                      name="square-menu"
                                      class="h-4 w-4"
                                    />
                                  </a>
                                  <button
                                    type="button"
                                    class="p-1 text-stone-400 hover:text-accent"
                                    [attr.aria-label]="text.renameValue"
                                    [disabled]="busy()"
                                    (click)="
                                      startRename({
                                        kind: 'value',
                                        key: entry.key,
                                        value: value.value,
                                      })
                                    "
                                  >
                                    <app-admin-icon
                                      name="pencil"
                                      class="h-4 w-4"
                                    />
                                  </button>
                                </span>
                              </div>
                            }
                          </li>
                        }
                      </ul>
                    } @else {
                      <div class="py-3">
                        <app-skeleton [lines]="2" />
                      </div>
                    }
                  </div>
                }
              </li>
            }
          </ul>
        </div>
      }
    } @else if (showSkeleton()) {
      <app-skeleton [lines]="6" />
    }

    @if (renameError()) {
      <p class="mt-4 text-sm text-red-700" role="alert">{{ renameError() }}</p>
    }

    <!-- One form for both renames: the text is all that differs, and both
         rewrite every product carrying it. -->
    <ng-template #form>
      <form class="flex flex-wrap items-end gap-3" (submit)="save($event)">
        <input
          appInput
          size="sm"
          class="w-72"
          name="rename"
          autocomplete="off"
          [attr.aria-label]="text.newText"
          [value]="draft()"
          (input)="draft.set($any($event.target).value)"
        />
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
      </form>
    </ng-template>
  `,
})
export class AttributeInventoryPage {
  private readonly service = inject(AttributesService);
  private readonly confirm = inject(ConfirmService);
  protected readonly text = inject(ADMIN_TEXT).attributeInventory;
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly catalogText = inject(APP_TEXT).catalog;

  protected readonly keys = resource({ loader: () => this.service.listKeys() });
  protected readonly showSkeleton = delayedLoading(this.keys.isLoading);

  /**
   * Which key arrives open, from the URL — how the product editor's grid hands
   * a row over: the question there ("what does the rest of the catalog call
   * this, and with which values?") is answered by this row, expanded.
   */
  readonly key = input('');

  /** The key whose values are open; one at a time, so the list stays scannable. */
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

  protected toggle(key: string): void {
    this.cancel();
    this.expanded.update((current) => (current === key ? null : key));
  }

  protected isRenaming(target: RenameTarget): boolean {
    const current = this.renaming();
    if (!current || current.kind !== target.kind) return false;
    if (current.kind === 'key') return current.key === target.key;
    return (
      current.key === target.key &&
      target.kind === 'value' &&
      current.value === target.value
    );
  }

  protected productsLabel(count: number): string {
    return this.text.products.replace('{count}', String(count));
  }

  protected valuesLabel(count: number): string {
    return this.text.values.replace('{count}', String(count));
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

  /**
   * Renaming onto text already in use merges the two, which is usually the
   * whole point — so it is allowed, and the confirmation says which it is
   * about to do rather than refusing.
   */
  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const target = this.renaming();
    if (!target || this.busy()) return;

    const to = this.draft().trim();
    const from = target.kind === 'key' ? target.key : target.value;
    if (!to || to === from) return this.cancel();

    const merges = this.existingTexts(target).includes(to);
    const confirmed = await this.confirm.ask({
      heading: this.text.renameTitle,
      message: (merges ? this.text.mergeConfirm : this.text.renameConfirm)
        // An empty value has to be named here too, or the sentence has a hole
        // in it where the thing being renamed should be.
        .replace('{from}', from || this.text.emptyValue)
        .replace('{to}', to),
      confirmLabel: this.common.save,
      cancelLabel: this.common.cancel,
    });
    if (!confirmed) return;

    this.busy.set(true);
    this.renameError.set(null);
    try {
      if (target.kind === 'key') {
        await this.service.renameKey({ from, to });
        // The key the values were listed under is gone; follow it.
        this.expanded.update((key) => (key === from ? to : key));
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

  /** The texts a rename could collide with — its siblings in the same list. */
  private existingTexts(target: RenameTarget): string[] {
    if (target.kind === 'key') {
      return (this.keys.value() ?? []).map((entry) => entry.key);
    }
    return (this.values.value() ?? []).map((value) => value.value);
  }

  constructor() {
    usePageSeo({ name: () => this.text.title });
  }
}
