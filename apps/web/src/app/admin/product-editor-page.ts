import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AdminCategory,
  CatalogImage,
  ProductAttribute,
  ProductDetail,
  ProductInput,
  slugify,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { majorToMinor, minorToMajor } from '../catalog/price';
import { ProductDetailView } from '../catalog/product-detail-view';
import { UnsavedChangesAware } from '../pages/unsaved-changes.guard';
import { Button } from '../ui/button';
import { LucideIcon } from '../ui/icons/lucide-icon';
import { RichTextEditor } from './rich-text-editor';
import { CategoryPicker } from './category-picker';
import { ProductAttributesEditor } from './product-attributes-editor';
import { ProductImageGallery } from './product-image-gallery';
import { AdminCatalogService } from './admin-catalog.service';

/**
 * Add/Edit a product (FR-ADM-01). One screen for both: `/admin/products/new`
 * and `/admin/products/:slug/edit`. Mirrors the static-page editor's shape —
 * dirty tracking (via a route guard), a live preview, and a stable slug that is
 * derived from the name but overridable. Browser-only (an admin route).
 */
@Component({
  selector: 'app-product-editor-page',
  imports: [
    Button,
    LucideIcon,
    RichTextEditor,
    CategoryPicker,
    ProductAttributesEditor,
    ProductImageGallery,
    ProductDetailView,
  ],
  template: `
    <h1 class="mb-6 text-3xl font-bold tracking-tight">
      {{ isNew ? text.newTitle : text.editTitle }}
    </h1>

    @if (loading()) {
      <p class="text-stone-500" role="status">…</p>
    } @else if (notFound()) {
      <p class="text-stone-600" role="alert">{{ text.saveError }}</p>
    } @else if (previewing()) {
      <p
        class="mb-6 rounded-md bg-stone-100 px-4 py-2 text-sm text-stone-600"
        role="status"
      >
        {{ text.previewNotice }}
      </p>
      <app-product-detail-view [item]="previewItem()" />
    } @else {
      <div class="space-y-6">
        <label class="block">
          <span class="mb-1 block text-sm font-medium">{{ text.name }}</span>
          <input
            type="text"
            class="w-full rounded-md border border-stone-300 px-3 py-2 focus:border-primary focus:outline-none"
            [value]="name()"
            (input)="name.set($any($event.target).value)"
          />
        </label>

        <div class="flex flex-wrap gap-6">
          <label class="block">
            <span class="mb-1 block text-sm font-medium">{{ text.price }}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              class="w-40 rounded-md border border-stone-300 px-3 py-2 focus:border-primary focus:outline-none"
              [value]="priceInput()"
              (input)="priceInput.set($any($event.target).value)"
            />
          </label>

          <div class="flex-1">
            <span class="mb-1 block text-sm font-medium">{{
              text.category
            }}</span>
            <app-category-picker
              [categories]="categories()"
              [value]="categoryId()"
              [placeholder]="text.categoryPlaceholder"
              [ariaLabel]="text.category"
              (valueChange)="categoryId.set($event)"
            />
          </div>
        </div>

        <label class="block">
          <span class="mb-1 block text-sm font-medium">{{ text.slug }}</span>
          <input
            type="text"
            class="w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none"
            [value]="effectiveSlug()"
            (input)="onSlugInput($any($event.target).value)"
          />
          <span class="mt-1 block text-xs text-stone-500">{{
            text.slugHint
          }}</span>
        </label>

        <div>
          <span class="mb-1 block text-sm font-medium">{{
            text.description
          }}</span>
          <app-rich-text-editor
            preset="product"
            [value]="description()"
            (contentChange)="description.set($event)"
          />
        </div>

        <div>
          <app-product-attributes-editor
            [value]="attributes()"
            (valueChange)="attributes.set($event)"
          />
        </div>

        <div>
          <app-product-image-gallery
            [value]="images()"
            (valueChange)="images.set($event)"
          />
        </div>

        <label class="block">
          <span class="mb-1 block text-sm font-medium">{{
            text.sourceId
          }}</span>
          <input
            type="text"
            class="w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none"
            [value]="sourceId()"
            (input)="sourceId.set($any($event.target).value)"
          />
          <span class="mt-1 block text-xs text-stone-500">{{
            text.sourceIdHint
          }}</span>
        </label>
      </div>
    }

    @if (error()) {
      <p class="mt-4 text-sm text-red-700" role="alert">{{ error() }}</p>
    }

    @if (!loading() && !notFound()) {
      <div class="mt-6 flex flex-wrap gap-3">
        <button
          appButton
          type="button"
          class="gap-2"
          [disabled]="saving()"
          (click)="save()"
        >
          <app-lucide-icon name="save" class="h-4 w-4" />
          {{ saving() ? text.saving : text.save }}
        </button>
        <button
          appButton
          variant="secondary"
          type="button"
          class="gap-2"
          (click)="previewing.set(!previewing())"
        >
          <app-lucide-icon
            [name]="previewing() ? 'pencil' : 'eye'"
            class="h-4 w-4"
          />
          {{ previewing() ? text.resumeEditing : text.preview }}
        </button>
        <button
          appButton
          variant="secondary"
          type="button"
          class="gap-2"
          (click)="cancel()"
        >
          <app-lucide-icon name="x" class="h-4 w-4" />
          {{ text.cancel }}
        </button>
      </div>
    }
  `,
})
export class ProductEditorPage implements UnsavedChangesAware {
  private readonly service = inject(AdminCatalogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;
  protected readonly text = inject(APP_TEXT).productEditor;

  /** null slug param → the "new" route. */
  private readonly slugParam = this.route.snapshot.paramMap.get('slug');
  protected readonly isNew = this.slugParam === null;

  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly categories = signal<AdminCategory[]>([]);

  protected readonly name = signal('');
  protected readonly slug = signal('');
  private readonly slugTouched = signal(false);
  protected readonly priceInput = signal('');
  protected readonly categoryId = signal('');
  protected readonly sourceId = signal('');
  protected readonly description = signal('');
  protected readonly attributes = signal<ProductAttribute[]>([]);
  protected readonly images = signal<CatalogImage[]>([]);

  protected readonly previewing = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  // JSON snapshot of the form at load, for dirty detection.
  private original = '';
  private navigatingAway = false;

  /** For a new product the slug tracks the name until the admin edits it. */
  protected readonly effectiveSlug = computed(() =>
    this.isNew && !this.slugTouched() ? slugify(this.name()) : this.slug(),
  );

  private readonly previewPriceMinor = computed(() => {
    const major = Number(this.priceInput());
    return Number.isFinite(major) ? majorToMinor(major, this.currency) : 0;
  });

  /** The current form state as a ProductDetail, so the preview renders through
   * the exact same component the storefront uses. */
  protected readonly previewItem = computed<ProductDetail>(() => {
    const category = this.categories().find((c) => c.id === this.categoryId());
    return {
      slug: this.effectiveSlug(),
      name: this.name(),
      priceMinor: this.previewPriceMinor(),
      descriptionHtml: this.description(),
      images: this.images(),
      attributes: this.attributes().filter(
        (a) => a.key.trim() !== '' || a.value.trim() !== '',
      ),
      category: category
        ? { slug: category.slug, name: category.name }
        : { slug: '', name: '—' },
    };
  });

  private readonly dirty = computed(() => this.snapshot() !== this.original);

  constructor() {
    void this.load();
  }

  hasUnsavedChanges(): boolean {
    return !this.navigatingAway && this.dirty();
  }

  private async load(): Promise<void> {
    this.categories.set(await this.service.listCategories());
    const existingSlug = this.slugParam;
    if (existingSlug !== null) {
      const product = await this.service.getProduct(existingSlug);
      if (!product) {
        this.notFound.set(true);
        this.loading.set(false);
        return;
      }
      this.name.set(product.name);
      this.slug.set(product.slug);
      this.priceInput.set(
        String(minorToMajor(product.priceMinor, this.currency)),
      );
      this.categoryId.set(product.categoryId);
      this.sourceId.set(product.sourceId);
      this.description.set(product.descriptionHtml);
      this.attributes.set(product.attributes);
      this.images.set(product.images);
    } else {
      // "Add product in this category" preselects it (by slug) — set before the
      // snapshot so the default doesn't count as an unsaved change.
      const categorySlug = this.route.snapshot.queryParamMap.get('category');
      const match = this.categories().find((c) => c.slug === categorySlug);
      if (match) this.categoryId.set(match.id);
    }
    this.original = this.snapshot();
    this.loading.set(false);
  }

  private snapshot(): string {
    return JSON.stringify({
      name: this.name(),
      slug: this.effectiveSlug(),
      price: this.priceInput(),
      categoryId: this.categoryId(),
      sourceId: this.sourceId(),
      description: this.description(),
      attributes: this.attributes(),
      images: this.images(),
    });
  }

  protected onSlugInput(value: string): void {
    this.slugTouched.set(true);
    this.slug.set(value);
  }

  protected async save(): Promise<void> {
    if (!this.name().trim()) return this.error.set(this.text.nameRequired);
    if (!this.categoryId()) return this.error.set(this.text.categoryRequired);
    const major = Number(this.priceInput());
    if (
      this.priceInput().trim() === '' ||
      !Number.isFinite(major) ||
      major < 0
    ) {
      return this.error.set(this.text.priceInvalid);
    }

    // A hand-typed slug (or, when new, the name-derived one) is sent as an
    // override; for a new product left untouched we omit it so the server
    // derives and de-duplicates it.
    const slug = this.isNew
      ? this.slugTouched() && this.slug().trim()
        ? this.slug().trim()
        : undefined
      : this.slug().trim() || undefined;
    const sourceId = this.sourceId().trim() || undefined;

    const body: ProductInput = {
      name: this.name().trim(),
      priceMinor: majorToMinor(major, this.currency),
      categoryId: this.categoryId(),
      descriptionHtml: this.description(),
      // Drop rows with no key — a value without a name is meaningless.
      attributes: this.attributes().filter((a) => a.key.trim() !== ''),
      images: this.images(),
      ...(slug ? { slug } : {}),
      ...(sourceId ? { sourceId } : {}),
    };

    this.saving.set(true);
    this.error.set(null);
    const existingSlug = this.slugParam;
    const result =
      existingSlug === null
        ? await this.service.createProduct(body)
        : await this.service.updateProduct(existingSlug, body);

    if (result.ok) {
      this.navigatingAway = true; // let the unsaved-changes guard pass
      await this.router.navigate(['/product', result.product.slug]);
    } else {
      this.error.set(result.message);
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    // The route's canDeactivate guard confirms if there are unsaved changes.
    const existingSlug = this.slugParam;
    void this.router.navigate(
      existingSlug === null ? ['/catalog'] : ['/product', existingSlug],
    );
  }
}
