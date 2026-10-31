import {
  Component,
  computed,
  effect,
  forwardRef,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { disabled, form } from '@angular/forms/signals';
import { filled } from '../../../shared/core/field-rules';
import { ActivatedRoute } from '@angular/router';
import { CatalogImage } from '@b2b-catalog-platform/shared/core/catalog';
import { AdminCategory } from '@b2b-catalog-platform/shared/admin/catalog';
import { slugify } from '@b2b-catalog-platform/shared/core/catalog';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { LockedFieldMarker } from '../../ownership/locked-field-marker';
import { OwnershipService } from '../../settings/ownership.service';
import { usePageSeo } from '../../../shared/core/page-seo';
import { LockedNote } from '../../ownership/locked-note';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { delayedLoading } from '../../../shared/core/delayed-loading';
import { UnsavedChangesAware } from '../../unsaved-changes.guard';
import { UnsavedChanges } from '../../unsaved-changes';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import {
  FieldAttempt,
  FIELD_ATTEMPT,
} from '@b2b-catalog-platform/ui/fields/field-attempt';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { FORM_FIELDS } from '@b2b-catalog-platform/ui/fields/form-fields';
import { submitAttempt } from '@b2b-catalog-platform/ui/fields/submit-attempt';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import {
  CategoriesService,
  type CategorySaveErrorCode,
} from './categories.service';
import { injectEditorReturn } from '../../../shared/edit-mode/editor-return';
import { categoriesOutside } from './category-tree';

import { ImagePicker } from '../../media/image-picker';
import { CategoryPicker } from './category-picker';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { SaveButton } from '../../ui/save-button';
import { CancelButton } from '../../ui/cancel-button';
import { SHARED_TEXT } from '../../../shared/config/shared-text';

interface CategoryDraft {
  name: string;
  /** For where the parent is visible; empty falls back to the name. */
  shortName: string;
  slug: string;
  parentId: string;
  sourceId: string;
}

/**
 * A category's name, parent, keys and mark (FR-ADM-01), with one save and an
 * unsaved-changes guard like the product editor. Order and deletion stay on
 * the list. Without a `:slug` it creates.
 */
@Component({
  selector: 'app-category-editor-page',
  imports: [
    CancelButton,
    SaveButton,
    FORM_FIELDS,
    LockedNote,
    Button,
    Icon,
    CategoryPicker,
    FieldLabel,
    Input,
    ImagePicker,
    Skeleton,
    LockedFieldMarker,
    PageTitle,
    ErrorText,
  ],
  // No <form> element: the buttons under the page save or leave, so the page
  // says itself when the form has been sent.
  providers: [
    {
      provide: FIELD_ATTEMPT,
      useExisting: forwardRef(() => CategoryEditorPage),
    },
  ],
  template: `
    <h1 uiPageTitle class="mb-4">
      {{ isNew ? text.newTitle : text.editTitle }}
    </h1>

    @if (loading()) {
      @if (showSkeleton()) {
        <ui-skeleton [lines]="4" />
      }
    } @else if (!isNew && !category()) {
      <p class="text-ink-subtle" role="alert">{{ text.saveError }}</p>
    } @else {
      <div class="max-w-3xl space-y-6">
        <!-- Two fields lock; the banner says the rest stay the shop's. -->
        @if (fieldsLocked()) {
          <app-locked-note>{{ ownershipText.fieldLocked }}</app-locked-note>
        }

        <ui-field
          [field]="form.name"
          [label]="text.name"
          controlId="category-name"
        >
          <app-locked-field-marker uiFieldCaption [field]="form.name" />
          <input
            type="text"
            uiInput
            class="w-full"
            [formField]="form.name"
            (input)="onNameInput()"
          />
        </ui-field>

        <div class="grid gap-6 sm:grid-cols-2">
          <ui-field
            [field]="form.shortName"
            [label]="text.shortName"
            [hint]="text.shortNameHint"
            controlId="category-short-name"
          >
            <input
              type="text"
              uiInput
              class="w-full"
              [formField]="form.shortName"
            />
          </ui-field>

          <ui-field
            [field]="form.parentId"
            [label]="text.parent"
            controlId="category-parent"
          >
            <app-category-picker
              [categories]="parentOptions()"
              [field]="form.parentId"
              [emptyLabel]="text.noParent"
            />
          </ui-field>
        </div>

        <div class="grid gap-6 sm:grid-cols-2">
          <ui-field
            [field]="form.slug"
            [label]="text.slug"
            [hint]="text.slugHint"
            controlId="category-slug"
          >
            <input
              type="text"
              uiInput
              class="w-full font-mono text-sm"
              [formField]="form.slug"
              (input)="onSlugInput($any($event.target).value)"
            />
          </ui-field>

          <ui-field
            [field]="form.sourceId"
            [label]="text.sourceId"
            [hint]="text.sourceIdHint"
            controlId="category-source-id"
          >
            <app-locked-field-marker uiFieldCaption [field]="form.sourceId" />
            <input
              type="text"
              uiInput
              class="w-full font-mono text-sm"
              [formField]="form.sourceId"
            />
          </ui-field>
        </div>

        <div>
          <span uiFieldLabel>{{ text.mark }}</span>
          <p class="mb-2 text-xs text-ink-subtle">{{ text.markHint }}</p>
          <app-image-picker
            [value]="mark()"
            [label]="text.mark"
            [square]="true"
            (valueChange)="mark.set($event)"
          />
        </div>
      </div>

      @if (error()) {
        <p uiErrorText class="mt-4" role="alert">{{ error() }}</p>
      }

      <div class="mt-6 flex max-w-3xl flex-wrap gap-3">
        <button
          uiButton
          appSaveButton
          type="button"
          [saving]="saving()"
          (click)="save()"
        >
          {{ adminText.actions.save }}
        </button>
        <button
          uiButton
          variant="secondary"
          appCancelButton
          type="button"
          (click)="cancel()"
        >
          {{ actionText.cancel }}
        </button>
      </div>
    }
  `,
})
export class CategoryEditorPage implements UnsavedChangesAware, FieldAttempt {
  private readonly service = inject(CategoriesService);
  private readonly route = inject(ActivatedRoute);
  protected readonly text = inject(ADMIN_TEXT).categories.editor;
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly ownershipText = inject(ADMIN_TEXT).ownership;
  private readonly ownership = inject(OwnershipService);

  /**
   * Only on a category the exchange knows, one with a source key. The shop
   * may still add categories of its own to arrange the exchange's under, and
   * no run ever writes those.
   */
  protected readonly fieldsLocked = computed(
    () =>
      !this.isNew &&
      this.category()?.sourceId != null &&
      (this.ownership.ownedAreas()?.includes('catalog') ?? false),
  );

  private readonly slugParam = this.route.snapshot.paramMap.get('slug');
  protected readonly isNew = this.slugParam === null;
  /** A slug, not an id: the storefront's add card knows only the public shape. */
  private readonly parentParam =
    this.route.snapshot.queryParamMap.get('parent');

  protected readonly loading = signal(true);
  protected readonly showSkeleton = delayedLoading(this.loading);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly all = signal<AdminCategory[]>([]);
  protected readonly category = signal<AdminCategory | null>(null);

  /** Where the slug comes from. A new record follows its name from the start.
   * An emptied box stays empty until the name is next edited, then follows
   * it, so clearing the box does not refill it from the current name. */
  private readonly slugSource = signal<'typed' | 'emptied' | 'name'>(
    this.isNew ? 'name' : 'typed',
  );
  private readonly model = signal<CategoryDraft>({
    name: '',
    shortName: '',
    slug: '',
    parentId: '',
    sourceId: '',
  });
  protected readonly form = form(
    this.model,
    (category) => {
      const locked = {
        when: () => this.fieldsLocked() && this.ownershipText.fieldLockedShort,
      };
      disabled(category.name, locked);
      disabled(category.sourceId, locked);
      filled(category.name, this.text.nameRequired);
    },
    { name: 'category-editor' },
  );
  readonly attempted = computed(() => submitAttempt(this.form)());
  /** FR-CAT-07. */
  protected readonly mark = signal<CatalogImage | null>(null);

  private readonly unsaved = new UnsavedChanges(() => this.snapshot());
  private readonly close = injectEditorReturn();

  /** Not itself nor anything under it, which would make a cycle. */
  protected readonly parentOptions = computed(() => {
    const current = this.category();
    return current ? categoriesOutside(this.all(), current.id) : this.all();
  });

  constructor() {
    void this.ownership.load();
    usePageSeo({
      name: () => (this.isNew ? this.text.newTitle : this.text.editTitle),
    });
    // A following slug is the name's, kept in the model so the field shows it;
    // an emptied one stays empty until the name is next edited.
    effect(() => {
      const name = this.form.name().value();
      if (this.slugSource() !== 'name') return;
      const next = slugify(name);
      untracked(() => {
        if (this.form.slug().value() !== next) {
          this.form.slug().value.set(next);
        }
      });
    });
    void this.load();
  }

  hasUnsavedChanges(): boolean {
    return this.unsaved.any();
  }

  private async load(): Promise<void> {
    const categories = await this.service.list();
    this.all.set(categories);
    if (this.isNew) {
      const parent = categories.find((c) => c.slug === this.parentParam);
      this.form.parentId().value.set(parent?.id ?? '');
      this.unsaved.loaded();
      this.loading.set(false);
      return;
    }
    const match = categories.find((c) => c.slug === this.slugParam) ?? null;
    this.category.set(match);
    if (match) {
      this.model.set({
        name: match.name,
        shortName: match.shortName ?? '',
        slug: match.slug,
        parentId: match.parentId ?? '',
        sourceId: match.sourceId ?? '',
      });
      this.mark.set(match.mark);
      this.unsaved.loaded();
    }
    this.loading.set(false);
  }

  private snapshot(): string {
    return JSON.stringify({ ...this.model(), mark: this.mark() });
  }

  protected onSlugInput(value: string): void {
    this.slugSource.set(value.trim() ? 'typed' : 'emptied');
  }

  protected onNameInput(): void {
    if (this.slugSource() === 'emptied') this.slugSource.set('name');
  }

  protected async save(): Promise<void> {
    const current = this.category();
    if (this.saving() || (!this.isNew && !current)) return;
    submitAttempt(this.form).set(true);
    if (this.form().invalid()) {
      this.form().errorSummary()[0]?.fieldTree().focusBoundControl();
      return;
    }
    const draft = this.model();
    // An emptied box saves the name's slug, as a following one does. For a
    // new category it is omitted, so the server derives and de-duplicates it;
    // an existing one sends it, because omitting it there keeps the stored one.
    const slug =
      this.slugSource() !== 'typed'
        ? this.isNew
          ? undefined
          : slugify(draft.name) || undefined
        : draft.slug.trim() || undefined;
    // Always sent, never omitted: an emptied box detaches the category from
    // the exchange, which is the only way to undo a key typed by mistake.
    const sourceId = draft.sourceId.trim() || null;

    const body = {
      name: draft.name.trim(),
      shortName: draft.shortName.trim() || null,
      parentId: draft.parentId || null,
      mark: this.mark(),
      ...(slug ? { slug } : {}),
      sourceId,
    };
    this.saving.set(true);
    this.error.set(null);
    try {
      const result = current
        ? await this.service.update(current.id, body)
        : await this.service.create(body);
      if (!result.ok) {
        this.error.set(this.refusalText(result.code));
        return;
      }
      this.unsaved.leave();
      await this.close('/admin/categories');
    } catch {
      this.error.set(this.text.saveError);
    } finally {
      this.saving.set(false);
    }
  }

  private refusalText(code: CategorySaveErrorCode): string {
    return code === 'catalog-externally-owned'
      ? this.ownershipText.fieldLocked
      : this.adminText.catalogErrors[code];
  }

  protected cancel(): void {
    void this.close('/admin/categories');
  }
}
