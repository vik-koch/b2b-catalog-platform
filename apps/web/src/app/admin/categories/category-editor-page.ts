import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  AdminCategory,
  CatalogImage,
  slugify,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { LockedFieldMarker } from '../ownership/locked-field-marker';
import { SettingsService } from '../settings/settings.service';
import { usePageSeo } from '../../core/page-seo';
import { LockedNote } from '../ownership/locked-note';
import { Skeleton } from '../../ui/skeleton';
import { delayedLoading } from '../../core/delayed-loading';
import { UnsavedChangesAware } from '../unsaved-changes.guard';
import { Button } from '../../ui/button';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { FieldLabel } from '../../ui/field-label';
import { Input } from '../../ui/input';
import {
  AdminCatalogService,
  type CategorySaveErrorCode,
} from '../admin-catalog.service';
import { injectEditorReturn } from '../editor-return';
import { categoryDescendantIds } from './category-tree';
import { ImagePicker } from '../media/image-picker';
import { CategoryPicker } from './category-picker';

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
    LockedNote,
    Button,
    AdminIcon,
    CategoryPicker,
    FieldLabel,
    Input,
    ImagePicker,
    Skeleton,
    LockedFieldMarker,
  ],
  template: `
    <h1 class="mb-4 text-3xl font-medium tracking-tight">
      {{ isNew ? text.newTitle : text.editTitle }}
    </h1>

    @if (loading()) {
      @if (showSkeleton()) {
        <app-skeleton [lines]="4" />
      }
    } @else if (!isNew && !category()) {
      <p class="text-muted" role="alert">{{ text.saveError }}</p>
    } @else {
      <div class="max-w-3xl space-y-6">
        <!-- Only two of this form's fields are locked, so the banner names the
             rest rather than letting the marks imply a whole read-only page:
             the nickname, the parent and the mark stay the shop's, which is
             what keeps the tree rearrangeable. -->
        @if (fieldsLocked()) {
          <app-locked-note>{{ ownershipText.fieldLocked }}</app-locked-note>
        }

        <label class="block">
          <span appFieldLabel>
            {{ text.name }}
            <span class="text-accent" aria-hidden="true">*</span>
            @if (fieldsLocked()) {
              <app-locked-field-marker />
            }
          </span>
          <input
            type="text"
            appInput
            class="w-full"
            [value]="name()"
            [disabled]="fieldsLocked()"
            (input)="onNameInput($any($event.target).value)"
          />
        </label>

        <div class="grid gap-6 sm:grid-cols-2">
          <label class="block">
            <span appFieldLabel>{{ text.shortName }}</span>
            <input
              type="text"
              appInput
              class="w-full"
              [value]="shortName()"
              (input)="shortName.set($any($event.target).value)"
            />
            <span class="mt-1 block text-xs text-subtle">{{
              text.shortNameHint
            }}</span>
          </label>

          <div class="block">
            <span appFieldLabel>{{ text.parent }}</span>
            <app-category-picker
              [categories]="parentOptions()"
              [value]="parentId()"
              [emptyLabel]="text.noParent"
              [ariaLabel]="text.parent"
              (valueChange)="parentId.set($event)"
            />
          </div>
        </div>

        <!-- The category's two identifiers side by side, as the product
             editor pairs them: the one the shop addresses it by and the one
             the source system knows it as. One per line below sm. -->
        <div class="grid gap-6 sm:grid-cols-2">
          <label class="block">
            <span appFieldLabel>{{ text.slug }}</span>
            <input
              type="text"
              appInput
              class="w-full font-mono text-sm"
              [value]="effectiveSlug()"
              (input)="onSlugInput($any($event.target).value)"
            />
            <span class="mt-1 block text-xs text-subtle">{{
              text.slugHint
            }}</span>
          </label>

          <label class="block">
            <span appFieldLabel>
              {{ text.sourceId }}
              @if (fieldsLocked()) {
                <app-locked-field-marker />
              }
            </span>
            <input
              type="text"
              appInput
              class="w-full font-mono text-sm"
              [value]="sourceId()"
              [disabled]="fieldsLocked()"
              (input)="sourceId.set($any($event.target).value)"
            />
            <span class="mt-1 block text-xs text-subtle">{{
              text.sourceIdHint
            }}</span>
          </label>
        </div>

        <div>
          <span appFieldLabel>{{ text.mark }}</span>
          <p class="mb-2 text-xs text-subtle">{{ text.markHint }}</p>
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
        <p class="mt-4 text-sm text-red-700" role="alert">{{ error() }}</p>
      }

      <div class="mt-6 flex max-w-3xl flex-wrap gap-3">
        <button
          appButton
          type="button"
          class="gap-2"
          [disabled]="saving()"
          (click)="save()"
        >
          <app-admin-icon name="save" class="h-4 w-4" />
          {{ saving() ? common.saving : common.save }}
        </button>
        <button
          appButton
          variant="secondary"
          type="button"
          class="gap-2"
          (click)="cancel()"
        >
          <app-admin-icon name="x" class="h-4 w-4" />
          {{ common.cancel }}
        </button>
      </div>
    }
  `,
})
export class CategoryEditorPage implements UnsavedChangesAware {
  private readonly admin = inject(AdminCatalogService);
  private readonly route = inject(ActivatedRoute);
  protected readonly text = inject(ADMIN_TEXT).categoryEditor;
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly ownershipText = inject(ADMIN_TEXT).ownership;
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

  protected readonly name = signal('');
  /** Optional nickname for contexts where the parent is visible; empty means
   * "fall back to the full name". */
  protected readonly shortName = signal('');
  protected readonly slug = signal('');
  /** Where the slug comes from. A new record follows its name from the start.
   * An emptied box stays empty until the name is next edited, then follows
   * it, so clearing the box does not refill it from the current name. */
  private readonly slugSource = signal<'typed' | 'emptied' | 'name'>(
    this.isNew ? 'name' : 'typed',
  );
  protected readonly parentId = signal('');
  protected readonly sourceId = signal('');
  /** The chip mark (FR-CAT-07). */
  protected readonly mark = signal<CatalogImage | null>(null);

  // JSON snapshot of the form at load, for dirty detection.
  private original = '';
  private navigatingAway = false;
  private readonly close = injectEditorReturn();
  private readonly dirty = computed(() => this.snapshot() !== this.original);

  protected readonly effectiveSlug = computed(() =>
    this.slugSource() === 'name'
      ? slugify(this.name())
      : this.slugSource() === 'emptied'
        ? ''
        : this.slug(),
  );

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
      this.parentId.set(parent?.id ?? '');
      this.original = this.snapshot();
      this.loading.set(false);
      return;
    }
    const match = categories.find((c) => c.slug === this.slugParam) ?? null;
    this.category.set(match);
    if (match) {
      this.name.set(match.name);
      this.shortName.set(match.shortName ?? '');
      this.slug.set(match.slug);
      this.parentId.set(match.parentId ?? '');
      this.sourceId.set(match.sourceId ?? '');
      this.mark.set(match.mark);
      this.original = this.snapshot();
    }
    this.loading.set(false);
  }

  private snapshot(): string {
    return JSON.stringify({
      name: this.name(),
      shortName: this.shortName(),
      slug: this.effectiveSlug(),
      sourceId: this.sourceId(),
      parentId: this.parentId(),
      mark: this.mark(),
    });
  }

  protected onSlugInput(value: string): void {
    this.slugSource.set(value.trim() ? 'typed' : 'emptied');
    this.slug.set(value);
  }

  protected onNameInput(value: string): void {
    this.name.set(value);
    if (this.slugSource() === 'emptied') this.slugSource.set('name');
  }

  protected async save(): Promise<void> {
    const current = this.category();
    if (!this.isNew && !current) return;
    // An emptied box saves the name's slug, as a following one does. For a
    // new category it is omitted, so the server derives and de-duplicates it;
    // an existing one sends it, because omitting it there keeps the stored one.
    const slug =
      this.slugSource() !== 'typed'
        ? this.isNew
          ? undefined
          : slugify(this.name()) || undefined
        : this.slug().trim() || undefined;
    // Always sent, never omitted: an emptied box detaches the category from
    // the exchange, which is the only way to undo a key typed by mistake.
    const sourceId = this.sourceId().trim() || null;

    const body = {
      name: this.name().trim(),
      shortName: this.shortName().trim() || null,
      parentId: this.parentId() || null,
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
      : this.common.catalogErrors[code];
  }

  protected cancel(): void {
    // The route's canDeactivate guard confirms if there are unsaved changes.
    void this.close('/admin/categories');
  }
}
