import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AdminCategory,
  CatalogImage,
  CustomerTier,
  basisDividesQuantities,
  piecePriceMilliMinor,
  piecesPerUnit,
  ProductAttribute,
  ProductDetail,
  ProductInput,
  slugify,
  totalMinor,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { usePageSeo } from '../../core/page-seo';
import { Skeleton } from '../../ui/skeleton';
import { delayedLoading } from '../../core/delayed-loading';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import {
  decimalSeparator,
  formatPriceInput,
  parsePriceInput,
} from '../../catalog/price';
import { ProductDetailView } from '../../catalog/product-detail-view';
import { UnsavedChangesAware } from '../../core/unsaved-changes.guard';
import { Button } from '../../ui/button';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { FieldLabel } from '../../ui/field-label';
import { Input } from '../../ui/input';
import { PriceField } from '../../ui/price-field';
import { RichTextEditor } from '../rich-text/rich-text-editor';
import { CategoryPicker } from '../categories/category-picker';
import { categoryAncestors } from '../categories/category-tree';
import { ProductAttributesEditor } from './product-attributes-editor';
import {
  ProductTierPricesEditor,
  TierPriceDraft,
} from './product-tier-prices-editor';
import { ProductImageGallery } from './product-image-gallery';
import {
  emptyPackaging,
  PackagingDraft,
  parseCount,
  ProductPackagingEditor,
} from './product-packaging-editor';
import { AdminCatalogService } from '../admin-catalog.service';
import { TiersService } from '../tiers/tiers.service';
import { injectEditorReturn } from '../editor-return';

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
    AdminIcon,
    RichTextEditor,
    CategoryPicker,
    ProductAttributesEditor,
    ProductPackagingEditor,
    ProductTierPricesEditor,
    ProductImageGallery,
    ProductDetailView,
    FieldLabel,
    Input,
    PriceField,
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
    } @else if (notFound()) {
      <p class="text-muted" role="alert">{{ text.saveError }}</p>
    } @else if (previewing()) {
      <p
        class="mb-6 rounded-md bg-stone-100 px-4 py-2 text-sm text-muted"
        role="status"
      >
        {{ text.previewNotice }}
      </p>
      <app-product-detail-view [item]="previewItem()" />
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

        <div class="flex flex-wrap gap-6">
          <label class="block">
            <span appFieldLabel>{{ text.price }}</span>
            <!-- Text, not type=number: a number input reports a half-typed
                 "18." as an empty value, so binding the signal back to it wiped
                 the field the moment a decimal separator was pressed. The
                 inputmode still gets the numeric keypad on touch. -->
            <input
              type="text"
              inputmode="decimal"
              appInput
              appPriceField
              class="w-40"
              [value]="priceInput()"
              [placeholder]="pricePlaceholder"
              (input)="priceInput.set($any($event.target).value)"
            />
          </label>

          <div class="flex-1">
            <span appFieldLabel>{{ text.category }}</span>
            <app-category-picker
              [categories]="categories()"
              [value]="categoryId()"
              [placeholder]="text.categoryPlaceholder"
              [ariaLabel]="text.category"
              (valueChange)="categoryId.set($event)"
            />
          </div>
        </div>

        <!-- Only where the deployment actually has tiers: with none, the base
             price is the whole pricing story and an empty section would only
             raise a question the admin cannot act on. -->
        @if (tiers().length > 0) {
          <div>
            <app-product-tier-prices-editor
              [tiers]="tiers()"
              [basePrice]="basePriceText()"
              [value]="tierPrices()"
              (valueChange)="tierPrices.set($event)"
            />
          </div>
        }

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

        <div>
          <span appFieldLabel>{{ text.description }}</span>
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
          <app-product-packaging-editor
            [value]="packaging()"
            [priceMinor]="previewPriceMinor()"
            (valueChange)="packaging.set($event)"
          />
        </div>

        <div>
          <app-product-image-gallery
            [value]="images()"
            (valueChange)="images.set($event)"
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
          <app-admin-icon name="save" class="h-4 w-4" />
          {{ saving() ? common.saving : common.save }}
        </button>
        <!-- Only while the product is off the storefront: publishing is one
             click from the list once it is on. -->
        @if (!published()) {
          <button
            appButton
            variant="secondary"
            type="button"
            class="gap-2"
            [disabled]="saving()"
            (click)="save(true)"
          >
            <app-admin-icon name="circle-check" class="h-4 w-4" />
            {{ text.saveAndPublish }}
          </button>
        }
        <button
          appButton
          variant="secondary"
          type="button"
          class="gap-2"
          (click)="previewing.set(!previewing())"
        >
          <app-admin-icon
            [name]="previewing() ? 'pencil' : 'eye'"
            class="h-4 w-4"
          />
          {{ previewing() ? common.resumeEditing : common.preview }}
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
export class ProductEditorPage implements UnsavedChangesAware {
  private readonly service = inject(AdminCatalogService);
  private readonly tiersService = inject(TiersService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly text = inject(ADMIN_TEXT).productEditor;

  /** null slug param → the "new" route. */
  private readonly slugParam = this.route.snapshot.paramMap.get('slug');
  protected readonly isNew = this.slugParam === null;

  protected readonly loading = signal(true);
  protected readonly showSkeleton = delayedLoading(this.loading);
  protected readonly notFound = signal(false);
  protected readonly categories = signal<AdminCategory[]>([]);
  protected readonly tiers = signal<CustomerTier[]>([]);

  protected readonly name = signal('');
  protected readonly slug = signal('');
  private readonly slugTouched = signal(false);
  protected readonly priceInput = signal('');
  protected readonly categoryId = signal('');
  protected readonly sourceId = signal('');
  protected readonly description = signal('');
  protected readonly attributes = signal<ProductAttribute[]>([]);
  protected readonly tierPrices = signal<TierPriceDraft[]>([]);
  protected readonly images = signal<CatalogImage[]>([]);
  protected readonly packaging = signal<PackagingDraft>(emptyPackaging());

  /** Null until loaded; drives the publish switch and where a save returns to. */
  protected readonly published = signal(false);
  protected readonly previewing = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  // JSON snapshot of the form at load, for dirty detection.
  private original = '';
  private navigatingAway = false;
  private readonly close = injectEditorReturn();

  /** For a new product the slug tracks the name until the admin edits it. */
  protected readonly effectiveSlug = computed(() =>
    this.isNew && !this.slugTouched() ? slugify(this.name()) : this.slug(),
  );

  /** Shows the shape a price takes here, e.g. "0,00" in a de-DE deployment. */
  protected readonly pricePlaceholder = `0${decimalSeparator(this.currency)}00`;

  /**
   * The base price as the tier fields advertise it — what an emptied tier
   * charges. Formatted, not the raw text, so a half-typed "18," still shows the
   * "18,00" it would save as; empty while the field holds no price at all.
   */
  protected readonly basePriceText = computed(() => {
    const minor = parsePriceInput(this.priceInput(), this.currency);
    return minor === null ? '' : formatPriceInput(minor, this.currency);
  });

  protected readonly previewPriceMinor = computed(
    () => parsePriceInput(this.priceInput(), this.currency) ?? 0,
  );

  /** The current form state as a ProductDetail, so the preview renders through
   * the exact same component the storefront uses. */
  protected readonly previewItem = computed<ProductDetail>(() => {
    const category = this.categories().find((c) => c.id === this.categoryId());
    const stored = this.previewPriceMinor();
    // Falls back to a piece-only shape while a packaging field is half-typed,
    // so the preview keeps rendering instead of blanking mid-edit.
    const packaging = this.packagingInput() ?? {
      piecesPerPack: null,
      packsPerBox: null,
      minPieceQty: 1,
      priceBasisPieces: 1,
      boxVolume: null,
      boxWeight: null,
    };
    const basis = packaging.priceBasisPieces;
    const priceFor = (unit: 'pack' | 'box') => {
      const pieces = piecesPerUnit(packaging, unit);
      return pieces === null ? null : totalMinor(stored, basis, pieces);
    };
    return {
      slug: this.effectiveSlug(),
      name: this.name(),
      priceMinor: Math.round(stored / basis),
      prices: {
        pieceMilliMinor: piecePriceMilliMinor(stored, basis),
        pack: priceFor('pack'),
        box: priceFor('box'),
      },
      packaging: {
        piecesPerPack: packaging.piecesPerPack,
        packsPerBox: packaging.packsPerBox,
        minPieceQty: packaging.minPieceQty,
      },
      boxDimensions:
        packaging.packsPerBox === null
          ? null
          : { volume: packaging.boxVolume, weight: packaging.boxWeight },
      descriptionHtml: this.description(),
      images: this.images(),
      attributes: this.attributes().filter(
        (a) => a.key.trim() !== '' || a.value.trim() !== '',
      ),
      category: category
        ? {
            slug: category.slug,
            name: category.name,
            shortName: category.shortName,
            ancestors: categoryAncestors(this.categories(), category.id),
          }
        : { slug: '', name: '—', shortName: null, ancestors: [] },
    };
  });

  private readonly dirty = computed(() => this.snapshot() !== this.original);

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
    const [categories, tiers] = await Promise.all([
      this.service.listCategories(),
      // The tier list is small and admin-only, like the categories above; both
      // are needed before the form can render its pickers.
      this.tiersService.list().then((r) => r.tiers),
    ]);
    this.categories.set(categories);
    this.tiers.set(tiers);
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
      this.priceInput.set(formatPriceInput(product.priceMinor, this.currency));
      this.categoryId.set(product.categoryId);
      this.sourceId.set(product.sourceId);
      this.description.set(product.descriptionHtml);
      this.attributes.set(product.attributes);
      this.images.set(product.images);
      this.published.set(product.publishedAt !== null);
      this.packaging.set({
        piecesPerPack: product.piecesPerPack?.toString() ?? '',
        packsPerBox: product.packsPerBox?.toString() ?? '',
        minPieceQty: product.minPieceQty.toString(),
        priceBasisPieces: product.priceBasisPieces.toString(),
        boxVolume: product.boxVolume ?? '',
        boxWeight: product.boxWeight ?? '',
      });
      this.tierPrices.set(
        product.tierPrices
          .map((p) => ({
            tierId: p.tierId,
            value: formatPriceInput(p.priceMinor, this.currency),
          }))
          .sort((a, b) => a.tierId.localeCompare(b.tierId)),
      );
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
      tierPrices: this.tierPrices(),
      packaging: this.packaging(),
    });
  }

  /**
   * The packaging fields as the contract wants them, or null if a field holds
   * something that is not a whole number. Blank means "not sold in that unit",
   * and for the basis and minimum it means 1.
   */
  private packagingInput(): {
    piecesPerPack: number | null;
    packsPerBox: number | null;
    minPieceQty: number;
    priceBasisPieces: number;
    boxVolume: string | null;
    boxWeight: string | null;
  } | null {
    const draft = this.packaging();
    const decimal = (text: string): string | null =>
      text.trim().replace(',', '.') || null;
    const optional = (text: string): number | null | undefined =>
      text.trim() === '' ? null : (parseCount(text) ?? undefined);
    const required = (text: string): number | undefined =>
      text.trim() === '' ? 1 : (parseCount(text) ?? undefined);

    const piecesPerPack = optional(draft.piecesPerPack);
    const packsPerBox = optional(draft.packsPerBox);
    const minPieceQty = required(draft.minPieceQty);
    const priceBasisPieces = required(draft.priceBasisPieces);
    if (
      piecesPerPack === undefined ||
      packsPerBox === undefined ||
      minPieceQty === undefined ||
      priceBasisPieces === undefined
    ) {
      return null;
    }

    return {
      piecesPerPack,
      // A box without a pack is meaningless, and the server refuses it.
      packsPerBox: piecesPerPack === null ? null : packsPerBox,
      minPieceQty,
      priceBasisPieces,
      // Dimensions belong to a box; without one they would never be shown.
      // Either separator is accepted while typing, like a price.
      boxVolume: packsPerBox === null ? null : decimal(draft.boxVolume),
      boxWeight: packsPerBox === null ? null : decimal(draft.boxWeight),
    };
  }

  protected onSlugInput(value: string): void {
    this.slugTouched.set(true);
    this.slug.set(value);
  }

  protected async save(andPublish = false): Promise<void> {
    if (!this.name().trim()) return this.error.set(this.text.nameRequired);
    if (!this.categoryId()) return this.error.set(this.text.categoryRequired);
    const priceMinor = parsePriceInput(this.priceInput(), this.currency);
    if (priceMinor === null) return this.error.set(this.text.priceInvalid);

    // Each tier field is validated against its own name, since "invalid price"
    // on a screen with several price fields does not say which one.
    const tierPrices = [];
    for (const draft of this.tierPrices()) {
      const tierMinor = parsePriceInput(draft.value, this.currency);
      if (tierMinor === null) {
        const tier = this.tiers().find((t) => t.id === draft.tierId);
        return this.error.set(
          this.text.tierPrices.invalid.replace('{tier}', tier?.label ?? ''),
        );
      }
      tierPrices.push({ tierId: draft.tierId, priceMinor: tierMinor });
    }

    const packaging = this.packagingInput();
    if (packaging === null) return this.error.set(this.text.packaging.invalid);
    if (!basisDividesQuantities(packaging, packaging.priceBasisPieces)) {
      return this.error.set(this.text.packaging.basisMustDivide);
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
      priceMinor,
      categoryId: this.categoryId(),
      descriptionHtml: this.description(),
      // Drop rows with no key — a value without a name is meaningless.
      attributes: this.attributes().filter((a) => a.key.trim() !== ''),
      images: this.images(),
      // The full set: a tier the admin cleared is absent here, and the server
      // takes that as "remove the override".
      tierPrices,
      ...packaging,
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

    if (!result.ok) {
      this.error.set(this.common.catalogErrors[result.code]);
      this.saving.set(false);
      return;
    }

    let product = result.product;
    if (andPublish) {
      // Two calls, and the order matters: the edits are already saved, so a
      // failure here is reported as a failure to *publish* rather than losing
      // the save behind a generic error.
      try {
        product = await this.service.setProductPublished(product.slug, true);
      } catch {
        this.published.set(false);
        this.error.set(this.text.publishError);
        this.saving.set(false);
        return;
      }
    }

    this.navigatingAway = true; // let the unsaved-changes guard pass
    if (product.publishedAt === null) {
      // No storefront page to land on — it would 404 — so the admin list stands
      // in, searched for the product just saved. Without the search the row is
      // somewhere in a list the admin then has to hunt through.
      // `searchTerm`, not `q`: the grid binds its inputs by parameter name.
      await this.router.navigate(['/admin/products'], {
        queryParams: { searchTerm: product.name },
      });
    } else {
      await this.router.navigate(['/product', product.slug]);
    }
  }

  protected cancel(): void {
    // The route's canDeactivate guard confirms if there are unsaved changes.
    const existingSlug = this.slugParam;
    void this.close(
      existingSlug === null ? '/catalog' : `/product/${existingSlug}`,
    );
  }
}
