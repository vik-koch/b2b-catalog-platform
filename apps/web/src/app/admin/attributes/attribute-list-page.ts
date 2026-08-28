import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AttributeDefinition,
  AttributeType,
  ATTRIBUTE_TYPES,
  slugSchema,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { APP_TEXT } from '../../config/app-text';
import { usePageSeo } from '../../core/page-seo';
import { useRowAnchor } from '../../core/row-anchor';
import { delayedLoading } from '../../core/delayed-loading';
import { Button } from '../../ui/button';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Input } from '../../ui/input';
import { FieldLabel } from '../../ui/field-label';
import { SelectField } from '../../ui/select-field';
import { Skeleton } from '../../ui/skeleton';
import { ConfirmService } from '../../ui/confirm.service';
import { AttributesService } from './attributes.service';

/** The row currently in edit mode: a definition's id, or the new-attribute form. */
type EditTarget = { id: string } | { id: null } | null;

/**
 * Filterable attributes (FR-ATTR-01) — which of the keys staff type into a
 * product's attribute grid the storefront offers as a filter.
 *
 * A definition is four fields, so rows edit in place and the add form is the
 * same markup with nothing in it — the tier list's shape, for the same reason.
 *
 * The counts on each row are the point of the screen as much as the fields
 * are: a name is matched against product attribute keys exactly, so a mistyped
 * definition matches nothing, and "0 products" here is the earliest anyone can
 * see it. For a number attribute the unparsed count is the second half of that
 * story — values that stay on the product page but drop out of the filter.
 */
@Component({
  selector: 'app-attribute-list-page',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    Button,
    AdminIcon,
    Input,
    FieldLabel,
    SelectField,
    Skeleton,
  ],
  template: `
    <div class="mb-4 flex items-center justify-between gap-4">
      <h1 class="text-3xl font-bold tracking-tight">{{ text.title }}</h1>
      <div class="flex items-center gap-2">
        <!-- The inventory answers the other half of the question: this list is
             what the shop filters by, that one is what the products carry. -->
        <a
          appButton
          variant="secondary"
          routerLink="/admin/attributes/inventory"
        >
          {{ text.toInventory }}
        </a>
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

      @if (definitions.error()) {
        <p class="text-muted" role="alert">{{ catalogText.loadError }}</p>
      } @else if (definitions.hasValue()) {
        <!-- overflow-hidden so a row's own background cannot square off the
           card's rounded corners. -->
        <div class="overflow-hidden rounded-lg border border-border">
          <ul
            class="divide-y divide-border"
            cdkDropList
            [cdkDropListDisabled]="busy() || editing() !== null"
            (cdkDropListDropped)="onDrop($event)"
          >
            @for (definition of definitions.value(); track definition.id) {
              <!-- scroll-mt clears the sticky header (see the inventory). -->
              <li
                class="bg-white p-4 scroll-mt-24"
                cdkDrag
                [cdkDragData]="definition"
                [id]="rowId(definition.name)"
              >
                @if (isEditing(definition.id)) {
                  <ng-container [ngTemplateOutlet]="form" class="bg-white" />
                } @else {
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span class="font-medium text-stone-700">
                      {{ definition.name }}
                    </span>
                    <code class="rounded bg-stone-100 px-1.5 py-0.5 text-xs">
                      {{ definition.slug }}
                    </code>
                    <span class="text-sm text-subtle">
                      {{ typeLabel(definition) }} ·
                      {{ productsLabel(definition.productCount) }} ·
                      {{ valuesLabel(definition.valueCount) }}
                    </span>
                    <span class="ml-auto flex items-center gap-1">
                      <!-- The other half of the row: this is what the shop
                         filters by, the inventory is what the products
                         actually carry under that name — including the
                         spellings this definition does not match. Same icon
                         and same shape as the grid's own way in. -->
                      <a
                        class="p-1 text-stone-400 hover:text-accent"
                        routerLink="/admin/attributes/inventory"
                        [queryParams]="{ key: definition.name }"
                        [attr.aria-label]="text.showUsage"
                      >
                        <app-admin-icon name="square-menu" class="h-4 w-4" />
                      </a>
                      <!-- Ordering is the filter panel's order and nothing else,
                         so the handle sits with the row's other actions rather
                         than claiming a column of its own. A handle, not a pair
                         of step buttons: the category list, the image gallery
                         and the attribute grid itself are all dragged, and a
                         button that has to disable itself at the ends of the
                         list flickers through every reorder. -->
                      <span
                        cdkDragHandle
                        class="cursor-grab p-1 text-stone-300 hover:text-subtle active:cursor-grabbing"
                        [attr.aria-label]="common.reorder"
                        [title]="common.reorder"
                      >
                        <app-admin-icon name="grip-vertical" class="h-4 w-4" />
                      </span>
                      <button
                        type="button"
                        class="p-1 text-stone-400 hover:text-accent"
                        [attr.aria-label]="text.edit"
                        [disabled]="editing() !== null"
                        (click)="startEdit(definition)"
                      >
                        <app-admin-icon name="pencil" class="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        class="p-1 text-stone-400 hover:text-red-700"
                        [attr.aria-label]="text.delete"
                        [disabled]="busy()"
                        (click)="remove(definition)"
                      >
                        <app-admin-icon name="trash-2" class="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                  <!-- Both notes are about the exact match, which is the one
                     thing about this screen that surprises people. -->
                  @if (definition.productCount === 0) {
                    <p class="mt-2 text-sm text-amber-700">
                      {{ text.noMatch }}
                    </p>
                  } @else if (
                    definition.type === 'number' && definition.unparsedCount > 0
                  ) {
                    <p class="mt-2 text-sm text-amber-700">
                      {{ unparsedLabel(definition.unparsedCount) }}
                    </p>
                  }
                  @if (rowError()?.id === definition.id) {
                    <p class="mt-2 text-sm text-red-700" role="alert">
                      {{ rowError()?.message }}
                    </p>
                  }
                }
              </li>
            }
          </ul>

          @if (isEditing(null)) {
            <div
              class="p-4 bg-white"
              [class]="
                definitions.value().length !== 0 ? 'border-t border-border' : ''
              "
            >
              <ng-container [ngTemplateOutlet]="form" />
            </div>
          } @else if (definitions.value().length === 0) {
            <p class="p-4 bg-white text-sm text-muted">{{ text.empty }}</p>
          }
        </div>
      } @else if (showSkeleton()) {
        <app-skeleton [lines]="4" />
      }

      <!-- One form for both add and edit: a definition is the same four fields
         either way, and only the request differs. -->
      <ng-template #form>
        <!-- Fields and buttons share one baseline (items-end); the hints
           therefore sit on their own line below rather than lengthening one
           column and pulling the row out of alignment. -->
        <form class="flex flex-wrap items-end gap-4" (submit)="save($event)">
          <div>
            <label appFieldLabel for="attribute-name">
              {{ text.name }}
              <span class="text-accent" aria-hidden="true">*</span>
            </label>
            <input
              appInput
              size="sm"
              id="attribute-name"
              name="name"
              class="w-56"
              autocomplete="off"
              [value]="draftName()"
              [placeholder]="text.namePlaceholder"
              (input)="draftName.set($any($event.target).value)"
            />
          </div>
          <div>
            <label appFieldLabel for="attribute-type">{{ text.type }}</label>
            <app-select-field size="sm" class="w-36">
              <select
                appInput
                size="sm"
                id="attribute-type"
                name="type"
                class="w-full"
                [value]="draftType()"
                (change)="draftType.set($any($event.target).value)"
              >
                @for (type of types; track type) {
                  <option [value]="type">{{ text.types[type] }}</option>
                }
              </select>
            </app-select-field>
          </div>
          <!-- A unit measures a quantity: a text attribute has none, and the
             field would only invite "Blue cm". -->
          @if (draftType() === 'number') {
            <div>
              <label appFieldLabel for="attribute-unit">{{ text.unit }}</label>
              <input
                appInput
                size="sm"
                id="attribute-unit"
                name="unit"
                class="w-24"
                autocomplete="off"
                [value]="draftUnit()"
                [placeholder]="text.unitPlaceholder"
                (input)="draftUnit.set($any($event.target).value)"
              />
            </div>
          }
          <div>
            <label appFieldLabel for="attribute-slug">{{ text.slug }}</label>
            <input
              appInput
              size="sm"
              id="attribute-slug"
              name="slug"
              class="w-44 font-mono"
              autocomplete="off"
              [value]="draftSlug()"
              [placeholder]="text.slugPlaceholder"
              (input)="draftSlug.set($any($event.target).value)"
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
          <p class="w-full text-xs text-muted">{{ text.nameHint }}</p>
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
export class AttributeListPage {
  private readonly service = inject(AttributesService);
  private readonly confirm = inject(ConfirmService);
  protected readonly text = inject(ADMIN_TEXT).attributeList;
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly catalogText = inject(APP_TEXT).catalog;
  protected readonly types = ATTRIBUTE_TYPES;

  protected readonly definitions = resource({
    loader: () => this.service.list(),
  });
  protected readonly showSkeleton = delayedLoading(this.definitions.isLoading);

  /** Which row is open for editing — `{ id: null }` is the add form. */
  protected readonly editing = signal<EditTarget>(null);
  protected readonly draftName = signal('');
  protected readonly draftSlug = signal('');
  protected readonly draftType = signal<AttributeType>('text');
  protected readonly draftUnit = signal('');
  protected readonly formError = signal<string | null>(null);
  /** A refusal that belongs to a row rather than the form — a lost delete. */
  protected readonly rowError = signal<{ id: string; message: string } | null>(
    null,
  );
  protected readonly busy = signal(false);
  protected readonly reorderError = signal(false);

  /**
   * Moves an attribute one place in the filter panel and commits immediately —
   * the click *is* the save, so there is nothing to confirm.
   */
  protected onDrop(event: CdkDragDrop<AttributeDefinition>): void {
    if (event.previousIndex === event.currentIndex) return;
    void this.move(event.previousIndex, event.currentIndex);
  }

  protected async move(from: number, to: number): Promise<void> {
    const current = this.definitions.value();
    if (!current || to < 0 || to >= current.length) return;

    const ordered = [...current];
    moveItemInArray(ordered, from, to);
    // Positions are re-numbered from zero on every move: the numbers carry no
    // meaning of their own, only the sequence does.
    const order = ordered.map((definition, index) => ({
      id: definition.id,
      sortOrder: index,
    }));

    this.busy.set(true);
    this.reorderError.set(false);
    try {
      this.definitions.set(await this.service.reorder({ order }));
    } catch {
      this.reorderError.set(true);
      this.definitions.reload();
    } finally {
      this.busy.set(false);
    }
  }

  protected isEditing(id: string | null): boolean {
    const target = this.editing();
    return target !== null && target.id === id;
  }

  /** The type, with the unit appended where there is one: "Number (cm)". */
  protected typeLabel(definition: AttributeDefinition): string {
    const type = this.text.types[definition.type];
    return definition.unit ? `${type} (${definition.unit})` : type;
  }

  protected productsLabel(count: number): string {
    return this.text.products.replace('{count}', String(count));
  }

  protected valuesLabel(count: number): string {
    return this.text.values.replace('{count}', String(count));
  }

  protected unparsedLabel(count: number): string {
    return this.text.unparsed.replace('{count}', String(count));
  }

  protected startAdd(): void {
    this.reset();
    this.editing.set({ id: null });
  }

  protected startEdit(definition: AttributeDefinition): void {
    this.reset();
    this.editing.set({ id: definition.id });
    this.draftName.set(definition.name);
    this.draftSlug.set(definition.slug);
    this.draftType.set(definition.type);
    this.draftUnit.set(definition.unit ?? '');
  }

  protected cancel(): void {
    this.reset();
  }

  private reset(): void {
    this.editing.set(null);
    this.draftName.set('');
    this.draftSlug.set('');
    this.draftType.set('text');
    this.draftUnit.set('');
    this.formError.set(null);
    this.rowError.set(null);
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const target = this.editing();
    if (!target || this.busy()) return;

    const name = this.draftName().trim();
    const slug = this.draftSlug().trim();
    const unit = this.draftUnit().trim();
    // Checked here as well as by the contract so a typo is answered on the spot
    // rather than by a 400 the user has to interpret. An empty slug is valid:
    // the server derives one from the name.
    if (!name) return this.formError.set(this.text.nameRequired);
    if (slug && !slugSchema.safeParse(slug).success) {
      return this.formError.set(this.text.slugInvalid);
    }

    const body = {
      name,
      slug: slug || undefined,
      type: this.draftType(),
      // Retyping to text drops the unit the server would drop anyway, so the
      // form and the row agree the moment the save returns.
      unit: this.draftType() === 'number' ? unit || null : null,
    };

    this.busy.set(true);
    this.formError.set(null);
    try {
      const result = target.id
        ? await this.service.update(target.id, body)
        : await this.service.create(body);
      if (result.ok) {
        this.reset();
        this.definitions.reload();
      } else {
        // Which refusal, in the deployment's own words — a duplicate name is
        // worth naming rather than a generic "could not save".
        this.formError.set(this.text.errors[result.code]);
      }
    } catch {
      this.formError.set(this.text.saveError);
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Deleting is never blocked: no product data hangs off a definition, so this
   * only stops the attribute being filterable. Confirmed all the same, because
   * the storefront loses a filter the moment it happens.
   */
  protected async remove(definition: AttributeDefinition): Promise<void> {
    this.rowError.set(null);
    const confirmed = await this.confirm.ask({
      heading: this.text.deleteTitle,
      message: this.text.deleteConfirm.replace('{name}', definition.name),
      confirmLabel: this.text.delete,
      cancelLabel: this.common.cancel,
    });
    if (!confirmed) return;

    this.busy.set(true);
    try {
      const result = await this.service.remove(definition.id);
      if (result.ok) {
        this.definitions.reload();
      } else {
        this.rowError.set({
          id: definition.id,
          message: this.text.errors[result.code],
        });
      }
    } catch {
      this.rowError.set({
        id: definition.id,
        message: this.text.deleteError,
      });
    } finally {
      this.busy.set(false);
    }
  }

  /** The definition to land on, from the URL — how the inventory hands a key
   * back: "the shop filters by this, here is what it says". */
  readonly name = input('');

  /** The DOM id a deep link scrolls to. Whitespace is all that has to go: an id
   * may hold anything else, and collapsing more would let two names collide. */
  protected rowId(name: string): string {
    return `definition-${name.replace(/\s+/g, '_')}`;
  }

  constructor() {
    usePageSeo({ name: () => this.text.title });
    useRowAnchor(
      computed(() => (this.name() ? this.rowId(this.name()) : null)),
      computed(() => this.definitions.hasValue()),
    );
  }
}
