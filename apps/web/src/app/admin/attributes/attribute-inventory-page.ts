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
import { ADMIN_TEXT } from '../../config/admin-text';
import { APP_TEXT } from '../../config/app-text';
import { usePageSeo } from '../../core/page-seo';
import { useRowAnchor } from '../../core/row-anchor';
import { delayedLoading } from '../../core/delayed-loading';
import { Button } from '../../ui/button';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Input } from '../../ui/input';
import { HintBadge } from '../../ui/hint-badge';
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
  imports: [
    NgTemplateOutlet,
    RouterLink,
    Button,
    AdminIcon,
    HintBadge,
    Input,
    Skeleton,
  ],
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
              <!-- scroll-mt clears the sticky header: without it the anchor
                   puts the row's own heading under the bar and the values look
                   like the top of the list. -->
              <li [id]="rowId(entry.key)" class="scroll-mt-24">
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
                      <span class="text-sm text-subtle">
                        {{ productsLabel(entry.productCount) }} ·
                        {{ valuesLabel(entry.valueCount) }}
                      </span>
                      <span class="ml-auto flex items-center gap-1">
                        <!-- Whether the shop filters by this key, and the way to
                             its definition. States the fact where a freetext key
                             is concerned — most attributes are freetext and none
                             of them is a problem to be fixed — so it is deadened
                             rather than dropped, and never offers to declare
                             one. -->
                        @if (entry.definition) {
                          <a
                            class="p-1 text-stone-400 hover:text-accent"
                            routerLink="/admin/attributes"
                            [queryParams]="{ name: entry.key }"
                            [attr.aria-label]="text.toDefinition"
                          >
                            <app-admin-icon name="funnel" class="h-4 w-4" />
                          </a>
                        } @else {
                          <span
                            class="p-1 text-stone-300"
                            [attr.aria-label]="text.notFilterable"
                            [title]="text.notFilterable"
                          >
                            <app-admin-icon name="funnel" class="h-4 w-4" />
                          </span>
                        }
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
                                  <app-hint-badge
                                    tone="warning"
                                    [label]="text.notNumeric"
                                  >
                                    <app-admin-icon
                                      name="triangle-alert"
                                      class="h-3.5 w-3.5"
                                    />
                                  </app-hint-badge>
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
                      <!-- The placeholder is this list, not a generic block of
                           bars: the row count is already known from the key's
                           own line, and so is the shape of a
                           value row, so the values can arrive into exactly the
                           space they will occupy. Nothing below moves. -->
                      <ul
                        class="animate-pulse divide-y divide-border"
                        aria-hidden="true"
                      >
                        @for (
                          width of valuePlaceholders(entry.valueCount);
                          track $index
                        ) {
                          <li class="flex items-center gap-x-3 py-3">
                            <div
                              class="h-5 rounded bg-stone-200"
                              [style.width]="width"
                            ></div>
                            <div class="h-4 w-20 rounded bg-stone-200"></div>
                            <span class="ml-auto flex items-center gap-1">
                              <span
                                class="m-1 block h-4 w-4 rounded bg-stone-200"
                              ></span>
                              <span
                                class="m-1 block h-4 w-4 rounded bg-stone-200"
                              ></span>
                            </span>
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
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
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

  /**
   * The key whose values are open; one at a time, so the list stays scannable.
   *
   * Seeded from the URL and written back to it on every toggle, but **not** by
   * navigating: the router is configured to scroll to the top of the page on
   * every navigation (`withInMemoryScrolling`), so a query-parameter round trip
   * threw the list to the top and back on each click. `replaceState` moves the
   * address bar without one. What that buys is the original point — a reload or
   * a shared link opens the same row, and a stale `?key=` cannot sit in the URL
   * naming a row collapsed ten clicks ago.
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

  /** The DOM id a deep link scrolls to. Whitespace is all that has to go: an
   * id may hold anything else, and collapsing more would let two keys collide. */
  protected rowId(key: string): string {
    return `attribute-${key.replace(/\s+/g, '_')}`;
  }

  protected toggle(key: string): void {
    this.cancel();
    this.open(this.expanded() === key ? null : key);
  }

  /** Opens a row and says so in the address bar. Replaces rather than pushes:
   * expanding a row is reading, not a step to come back through. */
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
    if (!current || current.kind !== target.kind) return false;
    if (current.kind === 'key') return current.key === target.key;
    return (
      current.key === target.key &&
      target.kind === 'value' &&
      current.value === target.value
    );
  }

  /**
   * One placeholder per value the key is known to carry, with the value bar's
   * width cycling so the block reads as a list of different words rather than
   * as a column. A key with no values has nothing to stand in for.
   */
  protected valuePlaceholders(count: number): string[] {
    const widths = ['8rem', '5rem', '10rem'];
    return Array.from({ length: count }, (_, i) => widths[i % widths.length]);
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

  /** The texts a rename could collide with — its siblings in the same list. */
  private existingTexts(target: RenameTarget): string[] {
    if (target.kind === 'key') {
      return (this.keys.value() ?? []).map((entry) => entry.key);
    }
    return (this.values.value() ?? []).map((value) => value.value);
  }

  constructor() {
    usePageSeo({ name: () => this.text.title });
    // Arriving with ?key= — from a product's attribute grid, or from the
    // registry — should land on that row, not merely open it somewhere below.
    useRowAnchor(
      computed(() => (this.key() ? this.rowId(this.key()) : null)),
      computed(() => this.keys.hasValue()),
    );
  }
}
