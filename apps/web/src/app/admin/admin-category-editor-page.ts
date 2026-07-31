import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  AdminCategory,
  CatalogImage,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../config/admin-text';
import { UnsavedChangesAware } from '../pages/unsaved-changes.guard';
import { Button } from '../ui/button';
import { LucideIcon } from '../ui/icons/lucide-icon';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { AdminCatalogService } from './admin-catalog.service';
import { categoryDescendantIds } from './category-tree';
import { MediaService } from './media.service';
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
  selector: 'app-admin-category-editor-page',
  imports: [Button, LucideIcon, CategoryPicker, FieldLabel, Input],
  template: `
    <h1 class="mb-6 text-3xl font-bold tracking-tight">{{ text.editTitle }}</h1>

    @if (loading()) {
      <p class="text-stone-500" role="status">…</p>
    } @else if (!category()) {
      <p class="text-stone-600" role="alert">{{ text.saveError }}</p>
    } @else {
      <div class="space-y-6">
        <label class="block">
          <span appFieldLabel>{{ productText.name }}</span>
          <input
            type="text"
            appInput
            class="w-full"
            [value]="name()"
            (input)="name.set($any($event.target).value)"
          />
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
          <span appFieldLabel>{{ productText.slug }}</span>
          <input
            type="text"
            appInput
            class="w-full font-mono text-sm"
            [value]="slug()"
            (input)="slug.set($any($event.target).value)"
          />
        </label>

        <label class="block">
          <span appFieldLabel>{{ productText.description }}</span>
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
          <div class="flex items-center gap-3">
            @if (image(); as img) {
              <img
                [src]="img.thumb"
                alt=""
                class="h-16 w-16 rounded border border-stone-200 object-cover"
              />
              <button
                appButton
                variant="secondary"
                type="button"
                (click)="image.set(null)"
              >
                {{ text.removeImage }}
              </button>
            } @else {
              <input
                #imageInput
                type="file"
                class="hidden"
                [accept]="accept"
                (change)="onImage($event)"
              />
              <button
                appButton
                variant="secondary"
                type="button"
                class="gap-2"
                [disabled]="uploading()"
                (click)="imageInput.click()"
              >
                <app-lucide-icon name="image-plus" class="h-4 w-4" />
                {{ uploading() ? common.uploading : text.image }}
              </button>
            }
          </div>
        </div>
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
export class AdminCategoryEditorPage implements UnsavedChangesAware {
  private readonly admin = inject(AdminCatalogService);
  private readonly media = inject(MediaService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly text = inject(ADMIN_TEXT).categories;
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly productText = inject(ADMIN_TEXT).productEditor;
  protected readonly accept = ACCEPTED_IMAGE_MIME_TYPES.join(',');

  private readonly slugParam = this.route.snapshot.paramMap.get('slug') ?? '';

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly uploading = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly all = signal<AdminCategory[]>([]);
  protected readonly category = signal<AdminCategory | null>(null);

  protected readonly name = signal('');
  protected readonly slug = signal('');
  protected readonly parentId = signal('');
  protected readonly description = signal('');
  protected readonly image = signal<CatalogImage | null>(null);

  // JSON snapshot of the form at load, for dirty detection.
  private original = '';
  private navigatingAway = false;
  private readonly dirty = computed(() => this.snapshot() !== this.original);

  /** Parents this category may move under: everyone except itself and its
   * descendants (which would form a cycle). */
  protected readonly parentOptions = computed(() => {
    const current = this.category();
    if (!current) return [];
    const banned = categoryDescendantIds(this.all(), current.id);
    banned.add(current.id);
    return this.all()
      .filter((o) => !banned.has(o.id))
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );
  });

  constructor() {
    void this.load();
  }

  hasUnsavedChanges(): boolean {
    return !this.navigatingAway && this.dirty();
  }

  private async load(): Promise<void> {
    const categories = await this.admin.listCategories();
    this.all.set(categories);
    const match = categories.find((c) => c.slug === this.slugParam) ?? null;
    this.category.set(match);
    if (match) {
      this.name.set(match.name);
      this.slug.set(match.slug);
      this.parentId.set(match.parentId ?? '');
      this.description.set(match.description ?? '');
      this.image.set(match.image);
      this.original = this.snapshot();
    }
    this.loading.set(false);
  }

  private snapshot(): string {
    return JSON.stringify({
      name: this.name(),
      slug: this.slug(),
      parentId: this.parentId(),
      description: this.description(),
      image: this.image(),
    });
  }

  protected async save(): Promise<void> {
    const current = this.category();
    if (!current) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.admin.updateCategory(current.id, {
        name: this.name().trim() || this.text.defaultName,
        parentId: this.parentId() || null,
        description: this.description().trim() || null,
        image: this.image(),
        ...(this.slug().trim() ? { slug: this.slug().trim() } : {}),
      });
      this.navigatingAway = true; // let the unsaved-changes guard pass
      await this.router.navigate(['/admin/categories']);
    } catch {
      this.error.set(this.text.saveError);
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    // The route's canDeactivate guard confirms if there are unsaved changes.
    void this.router.navigate(['/admin/categories']);
  }

  protected async onImage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploading.set(true);
    this.error.set(null);
    try {
      this.image.set(await this.media.uploadCatalogImage(file));
    } catch {
      this.error.set(this.common.uploadError);
    } finally {
      this.uploading.set(false);
    }
  }
}
