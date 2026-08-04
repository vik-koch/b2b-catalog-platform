import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  AdminCategory,
  CatalogImage,
  slugify,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { usePageSeo } from '../../core/page-seo';
import { Skeleton } from '../../ui/skeleton';
import { delayedLoading } from '../../core/delayed-loading';
import { UnsavedChangesAware } from '../../core/unsaved-changes.guard';
import { Button } from '../../ui/button';
import { LucideIcon } from '../../ui/icons/lucide-icon';
import { FieldLabel } from '../../ui/field-label';
import { Input } from '../../ui/input';
import { AdminCatalogService } from '../admin-catalog.service';
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
 * overlay (name, parent, slug, description, image). Browser-only (an admin
 * route).
 */
@Component({
  selector: 'app-category-editor-page',
  imports: [
    Button,
    LucideIcon,
    CategoryPicker,
    FieldLabel,
    Input,
    ImagePicker,
    Skeleton,
  ],
  template: `
    <h1 class="mb-6 text-3xl font-bold tracking-tight">
      {{ isNew ? text.newTitle : text.editTitle }}
    </h1>

    @if (loading()) {
      @if (showSkeleton()) {
        <app-skeleton [lines]="4" />
      }
    } @else if (!isNew && !category()) {
      <p class="text-muted" role="alert">{{ text.saveError }}</p>
    } @else {
      <div class="space-y-6">
        <label class="block">
          <span appFieldLabel>{{ text.name }}</span>
          <input
            type="text"
            appInput
            class="w-full"
            [value]="name()"
            (input)="name.set($any($event.target).value)"
          />
        </label>

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
          <span appFieldLabel>{{ text.description }}</span>
          <textarea
            rows="3"
            appInput
            class="w-full"
            [value]="description()"
            (input)="description.set($any($event.target).value)"
          ></textarea>
        </label>

        <div>
          <span appFieldLabel>{{ text.image }}</span>
          <app-image-picker
            [value]="image()"
            [label]="text.image"
            (valueChange)="image.set($event)"
          />
        </div>

        <label class="block">
          <span appFieldLabel>{{ text.sourceId }}</span>
          <input
            type="text"
            appInput
            class="w-full font-mono text-sm"
            [value]="sourceId()"
            (input)="sourceId.set($any($event.target).value)"
          />
          <span class="mt-1 block text-xs text-subtle">{{
            text.sourceIdHint
          }}</span>
        </label>
      </div>

      @if (error()) {
        <p class="mt-4 text-sm text-red-700" role="alert">{{ error() }}</p>
      }

      <div class="mt-6 flex flex-wrap gap-3">
        <button
          appButton
          type="button"
          class="gap-2"
          [disabled]="saving()"
          (click)="save()"
        >
          <app-lucide-icon name="save" class="h-4 w-4" />
          {{ saving() ? common.saving : common.save }}
        </button>
        <button
          appButton
          variant="secondary"
          type="button"
          class="gap-2"
          (click)="cancel()"
        >
          <app-lucide-icon name="x" class="h-4 w-4" />
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
  private readonly slugTouched = signal(false);
  protected readonly parentId = signal('');
  protected readonly sourceId = signal('');
  protected readonly description = signal('');
  protected readonly image = signal<CatalogImage | null>(null);

  // JSON snapshot of the form at load, for dirty detection.
  private original = '';
  private navigatingAway = false;
  private readonly close = injectEditorReturn();
  private readonly dirty = computed(() => this.snapshot() !== this.original);

  /** For a new category the slug tracks the name until the admin edits it. */
  protected readonly effectiveSlug = computed(() =>
    this.isNew && !this.slugTouched() ? slugify(this.name()) : this.slug(),
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
      this.sourceId.set(match.sourceId);
      this.description.set(match.description ?? '');
      this.image.set(match.image);
      this.original = this.snapshot();
    }
    this.loading.set(false);
  }

  private snapshot(): string {
    return JSON.stringify({
      name: this.name(),
      shortName: this.shortName(),
      slug: this.effectiveSlug(),
      parentId: this.parentId(),
      description: this.description(),
      image: this.image(),
    });
  }

  protected onSlugInput(value: string): void {
    this.slugTouched.set(true);
    this.slug.set(value);
  }

  protected async save(): Promise<void> {
    const current = this.category();
    if (!this.isNew && !current) return;
    // A category is found by its name everywhere else in the admin UI, so an
    // unnamed one is not a useful thing to create.
    if (!this.name().trim()) {
      this.error.set(this.text.nameRequired);
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    // A hand-typed slug is sent as an override; for a new category left
    // untouched we omit it so the server derives and de-duplicates it.
    const slug = this.isNew
      ? this.slugTouched() && this.slug().trim()
        ? this.slug().trim()
        : undefined
      : this.slug().trim() || undefined;
    const sourceId = this.sourceId().trim() || undefined;

    const body = {
      name: this.name().trim(),
      shortName: this.shortName().trim() || null,
      parentId: this.parentId() || null,
      description: this.description().trim() || null,
      image: this.image(),
      ...(slug ? { slug } : {}),
      ...(sourceId ? { sourceId } : {}),
    };
    try {
      if (current) {
        await this.admin.updateCategory(current.id, body);
      } else {
        await this.admin.createCategory(body);
      }
      this.navigatingAway = true; // let the unsaved-changes guard pass
      await this.close('/admin/categories');
    } catch {
      this.error.set(this.text.saveError);
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    // The route's canDeactivate guard confirms if there are unsaved changes.
    void this.close('/admin/categories');
  }
}
