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
  AttributeType,
  ATTRIBUTE_TYPES,
} from '@b2b-catalog-platform/shared/core/catalog';
import { form, hidden, validate } from '@angular/forms/signals';
import { fillText } from '@b2b-catalog-platform/shared';

import {
  AttributeDefinition,
  SLUG_MAX_LENGTH,
  SLUG_PATTERN,
} from '@b2b-catalog-platform/shared/admin/catalog';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { usePageSeo } from '../../../shared/core/page-seo';
import { useRowAnchor } from '../../../shared/core/row-anchor';
import { delayedLoading } from '../../../shared/core/delayed-loading';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { filled } from '../../../shared/core/field-rules';
import { FORM_FIELDS } from '@b2b-catalog-platform/ui/fields/form-fields';
import { submitAttempt } from '@b2b-catalog-platform/ui/fields/submit-attempt';
import { SelectInput } from '@b2b-catalog-platform/ui/inputs/select-input';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { ConfirmService } from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { RecordFields } from '@b2b-catalog-platform/ui/lists/record-fields';
import { RecordFormActions } from '@b2b-catalog-platform/ui/lists/record-form-actions';
import { RecordRow } from '@b2b-catalog-platform/ui/lists/record-row';
import { UnpublishedCount } from '../products/unpublished-count';
import { AttributesService } from './attributes.service';
import { WarningNote } from '@b2b-catalog-platform/ui/content/warning-note';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { Hint } from '@b2b-catalog-platform/ui/fields/hint';
import { gripVerticalIcon } from '@b2b-catalog-platform/ui/icons/glyphs/grip-vertical';
import { pencilIcon } from '@b2b-catalog-platform/ui/icons/glyphs/pencil';
import { plusIcon } from '@b2b-catalog-platform/ui/icons/glyphs/plus';
import { saveIcon } from '@b2b-catalog-platform/ui/icons/glyphs/save';
import { trash2Icon } from '@b2b-catalog-platform/ui/icons/glyphs/trash-2';
import { xIcon } from '@b2b-catalog-platform/ui/icons/glyphs/x';
import { PageHeader } from '@b2b-catalog-platform/ui/content/page-header';

/** The row open for editing; `{ id: null }` is the add form. */
type EditTarget = { id: string } | { id: null } | null;

interface AttributeDraft {
  name: string;
  /** Empty asks the server to derive one from the name. */
  slug: string;
  type: AttributeType;
  unit: string;
}

const blankAttribute = (): AttributeDraft => ({
  name: '',
  slug: '',
  type: 'text',
  unit: '',
});

/**
 * The attribute keys the storefront offers as filters (FR-ATTR-01), edited in
 * place. A name matches product keys exactly, so a row's counts are where a
 * mistyped definition shows: "0 products", or for a number the values that
 * do not parse and drop out of the filter.
 */
@Component({
  selector: 'app-attribute-list-page',
  imports: [
    PageHeader,
    FORM_FIELDS,
    WarningNote,
    NgTemplateOutlet,
    RouterLink,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    Button,
    IconButton,
    Icon,
    Link,
    RecordRow,
    UnpublishedCount,
    RecordFields,
    RecordFormActions,
    Input,
    SelectInput,
    Skeleton,
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

      @if (definitions.error()) {
        <p class="text-ink-subtle" role="alert">{{ adminText.loadError }}</p>
      } @else if (definitions.hasValue()) {
        <div class="border-y border-edge">
          <ul
            class="divide-y divide-edge"
            cdkDropList
            [cdkDropListDisabled]="busy() || editing() !== null"
            (cdkDropListDropped)="onDrop($event)"
          >
            @for (definition of definitions.value(); track definition.id) {
              <!-- scroll-mt clears the sticky header (see the inventory). -->
              <li
                class="scroll-mt-24 py-3"
                cdkDrag
                [cdkDragData]="definition"
                [id]="rowId(definition.name)"
              >
                @if (isEditing(definition.id)) {
                  <ng-container [ngTemplateOutlet]="recordForm" />
                } @else {
                  <ui-record-row [compact]="true">
                    <!-- The order is the filter panel's and nothing else. -->
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
                    <span class="font-medium text-ink">
                      {{ definition.name }}
                    </span>
                    <code class="rounded-sm bg-surface px-1.5 py-0.5 text-xs">
                      {{ definition.slug }}
                    </code>
                    <ng-container recordMeta>
                      <span>
                        {{ typeLabel(definition) }} ·
                        @if (definition.productCount) {
                          <a
                            uiLink
                            routerLink="/admin/products"
                            [queryParams]="{ attributeKey: definition.name }"
                            [title]="text.showProducts"
                          >
                            {{ productsLabel(definition.productCount) }}
                          </a>
                          @if (definition.unpublishedProductCount) {
                            ·
                            <app-unpublished-count
                              [count]="definition.unpublishedProductCount"
                              [query]="{ attributeKey: definition.name }"
                            />
                          }
                        } @else {
                          {{ productsLabel(0) }}
                        }
                        ·
                        @if (definition.valueCount) {
                          <a
                            uiLink
                            routerLink="/admin/attributes/inventory"
                            [queryParams]="{ key: definition.name }"
                            [title]="text.showUsage"
                          >
                            {{ valuesLabel(definition.valueCount) }}
                          </a>
                        } @else {
                          {{ valuesLabel(0) }}
                        }
                      </span>
                    </ng-container>
                    <ng-container recordActions>
                      <button
                        uiIconButton
                        type="button"
                        [attr.aria-label]="adminText.actions.edit"
                        [disabled]="editing() !== null"
                        (click)="startEdit(definition)"
                      >
                        <ui-icon [glyph]="pencilIcon" />
                      </button>
                      <button
                        uiIconButton
                        variant="danger"
                        type="button"
                        [attr.aria-label]="adminText.actions.delete"
                        [disabled]="busy()"
                        (click)="remove(definition)"
                      >
                        <ui-icon [glyph]="trash2Icon" />
                      </button>
                    </ng-container>
                  </ui-record-row>
                  @if (definition.productCount === 0) {
                    <ui-warning-note class="mt-2">
                      {{ text.noMatch }}
                    </ui-warning-note>
                  } @else if (
                    definition.type === 'number' && definition.unparsedCount > 0
                  ) {
                    <ui-warning-note class="mt-2">
                      {{ unparsedLabel(definition.unparsedCount) }}
                    </ui-warning-note>
                  }
                  @if (rowError()?.id === definition.id) {
                    <p uiErrorText class="mt-2" role="alert">
                      {{ rowError()?.message }}
                    </p>
                  }
                }
              </li>
            }
          </ul>

          @if (isEditing(null)) {
            <div
              class="py-3"
              [class]="
                definitions.value().length !== 0 ? 'border-t border-edge' : ''
              "
            >
              <ng-container [ngTemplateOutlet]="recordForm" />
            </div>
          } @else if (definitions.value().length === 0) {
            <p class="py-3 text-sm text-ink-subtle">{{ text.empty }}</p>
          }
        </div>
      } @else if (showSkeleton()) {
        <ui-skeleton [lines]="4" />
      }

      <ng-template #recordForm>
        <form uiRecordFields [formRoot]="form" (submit)="save()">
          <ui-field
            [field]="form.name"
            [label]="text.name"
            controlId="attribute-name"
          >
            <input
              uiInput
              size="sm"
              class="w-full"
              autocomplete="off"
              [placeholder]="text.namePlaceholder"
              [formField]="form.name"
            />
          </ui-field>
          <ui-field
            [field]="form.slug"
            [label]="text.slug"
            controlId="attribute-slug"
          >
            <input
              uiInput
              size="sm"
              class="w-full font-mono"
              autocomplete="off"
              [placeholder]="text.slugPlaceholder"
              [formField]="form.slug"
            />
          </ui-field>
          <ui-field
            [field]="form.type"
            [label]="text.type"
            controlId="attribute-type"
          >
            <ui-select-input size="sm" class="block w-full">
              <select uiInput size="sm" class="w-full" [formField]="form.type">
                @for (type of types; track type) {
                  <option [value]="type">{{ text.types[type] }}</option>
                }
              </select>
            </ui-select-input>
          </ui-field>
          @if (draft().type === 'number') {
            <ui-field
              [field]="form.unit"
              [label]="text.unit"
              controlId="attribute-unit"
            >
              <input
                uiInput
                size="sm"
                class="w-full"
                autocomplete="off"
                [placeholder]="text.unitPlaceholder"
                [formField]="form.unit"
              />
            </ui-field>
          }
          <p uiHint class="sm:col-span-2">{{ text.nameHint }}</p>
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
export class AttributeListPage {
  protected readonly gripVerticalIcon = gripVerticalIcon;
  protected readonly pencilIcon = pencilIcon;
  protected readonly plusIcon = plusIcon;
  protected readonly saveIcon = saveIcon;
  protected readonly trash2Icon = trash2Icon;
  protected readonly xIcon = xIcon;
  private readonly service = inject(AttributesService);
  private readonly confirm = inject(ConfirmService);
  protected readonly text = inject(ADMIN_TEXT).attributes.list;
  private readonly productsText = inject(ADMIN_TEXT).products;
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly types = ATTRIBUTE_TYPES;

  protected readonly definitions = resource({
    loader: () => this.service.list(),
  });
  protected readonly showSkeleton = delayedLoading(this.definitions.isLoading);

  protected readonly editing = signal<EditTarget>(null);
  protected readonly draft = signal<AttributeDraft>(blankAttribute());
  protected readonly form = form(
    this.draft,
    (attribute) => {
      filled(attribute.name, this.text.nameRequired);
      // Empty is valid: the server derives a slug from the name.
      validate(attribute.slug, ({ value }) => {
        const slug = value().trim();
        return !slug ||
          (slug.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(slug))
          ? undefined
          : { kind: 'slug', message: this.text.slugInvalid };
      });
      hidden(attribute.unit, {
        when: ({ valueOf }) => valueOf(attribute.type) !== 'number',
      });
    },
    { name: 'attribute' },
  );
  protected readonly formError = signal<string | null>(null);
  /** A refusal that belongs to a row rather than the form: a lost delete. */
  protected readonly rowError = signal<{ id: string; message: string } | null>(
    null,
  );
  protected readonly busy = signal(false);
  protected readonly reorderError = signal(false);

  /** The drop is the save, so there is nothing to confirm. */
  protected onDrop(event: CdkDragDrop<AttributeDefinition>): void {
    if (event.previousIndex === event.currentIndex) return;
    void this.move(event.previousIndex, event.currentIndex);
  }

  private async move(from: number, to: number): Promise<void> {
    const current = this.definitions.value();
    if (!current || to < 0 || to >= current.length) return;

    const ordered = [...current];
    moveItemInArray(ordered, from, to);
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
    return fillText(this.productsText.count, { count });
  }

  protected valuesLabel(count: number): string {
    return fillText(this.text.values, { count });
  }

  protected unparsedLabel(count: number): string {
    return fillText(this.text.unparsed, { count });
  }

  protected startAdd(): void {
    this.reset();
    this.editing.set({ id: null });
  }

  protected startEdit(definition: AttributeDefinition): void {
    this.reset();
    this.editing.set({ id: definition.id });
    this.draft.set({
      name: definition.name,
      slug: definition.slug,
      type: definition.type,
      unit: definition.unit ?? '',
    });
  }

  protected cancel(): void {
    this.reset();
  }

  private reset(): void {
    this.editing.set(null);
    this.draft.set(blankAttribute());
    // The next row opened starts quiet, not red from this one's attempt.
    submitAttempt(this.form).set(false);
    this.formError.set(null);
    this.rowError.set(null);
  }

  protected async save(): Promise<void> {
    const target = this.editing();
    if (!target || this.busy() || this.form().invalid()) return;

    const draft = this.draft();
    const slug = draft.slug.trim();
    const body = {
      name: draft.name.trim(),
      slug: slug || undefined,
      type: draft.type,
      // The server drops a text attribute's unit too; sending null keeps the
      // row and the form in step.
      unit: draft.type === 'number' ? draft.unit.trim() || null : null,
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
        this.formError.set(this.text.errors[result.code]);
      }
    } catch {
      this.formError.set(this.text.saveError);
    } finally {
      this.busy.set(false);
    }
  }

  /** Never blocked, but confirmed: the storefront loses a filter at once. */
  protected async remove(definition: AttributeDefinition): Promise<void> {
    this.rowError.set(null);
    const confirmed = await this.confirm.ask({
      heading: this.text.deleteConfirm.heading,
      message: fillText(this.text.deleteConfirm.message, {
        name: definition.name,
      }),
      confirmLabel: this.text.deleteConfirm.confirm,
      cancelLabel: this.text.deleteConfirm.cancel ?? this.actionText.cancel,
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

  /** The definition to land on, from the URL: the inventory links back here. */
  readonly name = input('');

  /** Only whitespace goes: an id may hold anything else, and collapsing more
   * would let two names collide. */
  protected rowId(name: string): string {
    return `definition-${name.replace(/\s+/g, '_')}`;
  }

  constructor() {
    usePageSeo({ name: () => this.text.page.title });
    useRowAnchor(
      computed(() => (this.name() ? this.rowId(this.name()) : null)),
      computed(() => this.definitions.hasValue()),
    );
  }
}
