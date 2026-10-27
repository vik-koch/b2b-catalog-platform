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
import { filled } from '../../shared/core/field-rules';
import { ActivatedRoute } from '@angular/router';
import { CatalogImage } from '@b2b-catalog-platform/shared';
import { AdminCategory, slugify } from '@b2b-catalog-platform/shared/admin';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { LockedFieldMarker } from '../ownership/locked-field-marker';
import { SettingsService } from '../settings/settings.service';
import { usePageSeo } from '../../shared/core/page-seo';
import { LockedNote } from '../ownership/locked-note';
import { Skeleton } from '../../shared/ui/skeleton';
import { delayedLoading } from '../../shared/core/delayed-loading';
import { UnsavedChangesAware } from '../unsaved-changes.guard';
import { Button } from '../../shared/ui/button';
import { AdminIcon } from '../../shared/ui/icons/admin-icon';
import { FieldAttempt, FIELD_ATTEMPT } from '../../shared/ui/field-attempt';
import { FieldLabel } from '../../shared/ui/field-label';
import { FORM_FIELDS } from '../../shared/ui/form-fields';
import { submitAttempt } from '../../shared/ui/submit-attempt';
import { Input } from '../../shared/ui/input';
import {
  AdminCatalogService,
  type CategorySaveErrorCode,
} from '../admin-catalog.service';
import { injectEditorReturn } from '../../shared/edit-mode/editor-return';
import { categoryDescendantIds } from './category-tree';
import { ImagePicker } from '../media/image-picker';
import { CategoryPicker } from './category-picker';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { PageTitle } from '../../shared/ui/page-title';
import { ErrorText } from '../../shared/ui/error-text';

interface CategoryDraft {
  name: string;
  /** Optional nickname for contexts where the parent is visible; empty means
   * "fall back to the full name". */
  shortName: string;
  slug: string;
  parentId: string;
  sourceId: string;
}

/**
 * Edit a category (FR-ADM-01) on its own screen at
 * `/admin/categories/:slug/edit`. Mirrors the product editor's shape — a single
 * save, dirty tracking via a route guard — so category editing reads the same
 * as product editing rather than the list's earlier inline expansion. Structure
 * (add/reorder/delete) stays on the list; this page owns the presentation
 * overlay (name, parent, slug, mark). Browser-only (an admin
 * route).
 */
@Component({
  selector: 'app-category-editor-page',
  imports: [
    FORM_FIELDS,
    LockedNote,
    Button,
    AdminIcon,
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
    <h1 appPageTitle class="mb-4">
      {{ isNew ? text.newTitle : text.editTitle }}
    </h1>

    @if (loading()) {
      @if (showSkeleton()) {
        <app-skeleton [lines]="4" />
      }
    } @else if (!isNew && !category()) {
      <p class="text-ink-subtle" role="alert">{{ text.saveError }}</p>
    } @else {
      <div class="max-w-3xl space-y-6">
        <!-- Only two of this form's fields are locked, so the banner names the
             rest rather than letting the marks imply a whole read-only page:
             the nickname, the parent and the mark stay the shop's, which is
             what keeps the tree rearrangeable. -->
        @if (fieldsLocked()) {
          <app-locked-note>{{ ownershipText.fieldLocked }}</app-locked-note>
        }

        <app-field
          [field]="form.name"
          [label]="text.name"
          controlId="category-name"
        >
          <app-locked-field-marker appFieldCaption [field]="form.name" />
          <input
            type="text"
            appInput
            class="w-full"
            [formField]="form.name"
            (input)="onNameInput()"
          />
        </app-field>

        <div class="grid gap-6 sm:grid-cols-2">
          <app-field
            [field]="form.shortName"
            [label]="text.shortName"
            [hint]="text.shortNameHint"
            controlId="category-short-name"
          >
            <input
              type="text"
              appInput
              class="w-full"
              [formField]="form.shortName"
            />
          </app-field>

          <app-field
            [field]="form.parentId"
            [label]="text.parent"
            controlId="category-parent"
          >
            <app-category-picker
              [categories]="parentOptions()"
              [field]="form.parentId"
              [emptyLabel]="text.noParent"
            />
          </app-field>
        </div>

        <!-- The category's two identifiers side by side, as the product
             editor pairs them: the one the shop addresses it by and the one
             the source system knows it as. One per line below sm. -->
        <div class="grid gap-6 sm:grid-cols-2">
          <app-field
            [field]="form.slug"
            [label]="text.slug"
            [hint]="text.slugHint"
            controlId="category-slug"
          >
            <input
              type="text"
              appInput
              class="w-full font-mono text-sm"
              [formField]="form.slug"
              (input)="onSlugInput($any($event.target).value)"
            />
          </app-field>

          <app-field
            [field]="form.sourceId"
            [label]="text.sourceId"
            [hint]="text.sourceIdHint"
            controlId="category-source-id"
          >
            <app-locked-field-marker appFieldCaption [field]="form.sourceId" />
            <input
              type="text"
              appInput
              class="w-full font-mono text-sm"
              [formField]="form.sourceId"
            />
          </app-field>
        </div>

        <div>
          <span appFieldLabel>{{ text.mark }}</span>
          <p class="mb-2 text-xs text-ink-subtle">{{ text.markHint }}</p>
          <!-- Cropped to a square on upload, so the square tile beside it is
               the stored picture rather than a framing of it. -->
          <app-image-picker
            [value]="mark()"
            [label]="text.mark"
            [square]="true"
            (valueChange)="mark.set($event)"
          />
        </div>
      </div>

      @if (error()) {
        <p appErrorText class="mt-4" role="alert">{{ error() }}</p>
      }

      <div class="mt-6 flex max-w-3xl flex-wrap gap-3">
        <button
          appButton
          type="button"
          class="gap-2"
          [disabled]="saving()"
          (click)="save()"
        >
          <app-admin-icon name="save" class="size-4" />
          {{ saving() ? actionText.saving : adminText.actions.save }}
        </button>
        <button
          appButton
          variant="secondary"
          type="button"
          class="gap-2"
          (click)="cancel()"
        >
          <app-admin-icon name="x" class="size-4" />
          {{ actionText.cancel }}
        </button>
      </div>
    }
  `,
})
export class CategoryEditorPage implements UnsavedChangesAware, FieldAttempt {
  private readonly admin = inject(AdminCatalogService);
  private readonly route = inject(ActivatedRoute);
  protected readonly text = inject(ADMIN_TEXT).categories.editor;
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly ownershipText = inject(ADMIN_TEXT).ownership;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  private readonly ownership = inject(SettingsService);

  /**
   * Only an existing category the exchange knows — one carrying a source key.
   * A new one has nothing stored to compare a name against, and creating
   * categories stays open while the catalog is owned: the exchange creates the
   * ones its rows name, and the shop is left free to add the ones it wants to
   * arrange them under. Those keep their own name and key afterwards, since no
   * file names them and no run writes them.
   */
  protected readonly fieldsLocked = computed(
    () =>
      !this.isNew &&
      this.category()?.sourceId != null &&
      (this.ownership.ownedAreas()?.includes('catalog') ?? false),
  );

  // No :slug segment means this is `/admin/categories/new` — the same screen,
  // creating instead of updating, mirroring the product editor.
  private readonly slugParam = this.route.snapshot.paramMap.get('slug');
  protected readonly isNew = this.slugParam === null;
  /**
   * Preselected parent when an "add subcategory" affordance opened this screen.
   * Carried as a slug, not an id: the storefront's own add-card only knows the
   * public catalog shape, where categories are identified by slug.
   */
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
      // The two fields an exchange writes, on a category it knows. The reason
      // is what each field's lock says.
      const locked = {
        when: () => this.fieldsLocked() && this.ownershipText.fieldLockedShort,
      };
      disabled(category.name, locked);
      disabled(category.sourceId, locked);
      filled(category.name, this.text.nameRequired);
    },
    { name: 'category-editor' },
  );
  /** Read by every field on the page (FIELD_ATTEMPT). */
  readonly attempted = computed(() => submitAttempt(this.form)());
  /** The chip mark (FR-CAT-07). */
  protected readonly mark = signal<CatalogImage | null>(null);

  // JSON snapshot of the form at load, for dirty detection.
  private original = '';
  private navigatingAway = false;
  private readonly close = injectEditorReturn();
  private readonly dirty = computed(() => this.snapshot() !== this.original);

  /** Parents this category may move under: everyone except itself and its
   * descendants (which would form a cycle). */
  protected readonly parentOptions = computed(() => {
    const current = this.category();
    // A category that does not exist yet has no descendants to exclude, so
    // every category is a candidate parent.
    const banned = current
      ? categoryDescendantIds(this.all(), current.id)
      : new Set<string>();
    if (current) banned.add(current.id);
    return this.all()
      .filter((o) => !banned.has(o.id))
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );
  });

  constructor() {
    void this.ownership.load();
    // Admin screens are client-rendered, so this is for the browser tab
    // rather than for crawlers — but it is the same one-line contract.
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
    return !this.navigatingAway && this.dirty();
  }

  private async load(): Promise<void> {
    const categories = await this.admin.listCategories();
    this.all.set(categories);
    if (this.isNew) {
      // An empty form, so the category only exists once it is saved with a name
      // the admin chose — rather than appearing in the tree as "New category".
      const parent = categories.find((c) => c.slug === this.parentParam);
      this.form.parentId().value.set(parent?.id ?? '');
      this.original = this.snapshot();
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
      this.original = this.snapshot();
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
    if (!this.isNew && !current) return;
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
    try {
      const result = current
        ? await this.admin.updateCategory(current.id, body)
        : await this.admin.createCategory(body);
      if (!result.ok) {
        this.error.set(this.refusalText(result.code));
        this.saving.set(false);
        return;
      }
      this.navigatingAway = true; // let the unsaved-changes guard pass
      await this.close('/admin/categories');
    } catch {
      this.error.set(this.text.saveError);
      this.saving.set(false);
    }
  }

  /** A refusal is named by its code and worded here — never by what the server
   * wrote. The ownership one reuses the sentence the locked fields carry. */
  private refusalText(code: CategorySaveErrorCode): string {
    return code === 'catalog-externally-owned'
      ? this.ownershipText.fieldLocked
      : this.adminText.catalogErrors[code];
  }

  protected cancel(): void {
    // The route's canDeactivate guard confirms if there are unsaved changes.
    void this.close('/admin/categories');
  }
}
