import {
  afterNextRender,
  Component,
  computed,
  effect,
  forwardRef,
  inject,
  Injector,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  applyEach,
  disabled,
  form,
  maxLength,
  required,
  validate,
} from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import {
  effectiveTaxRate,
  fillText,
  formatTaxRate,
  parseTaxRate,
  moneyFormat,
  isPartialTaxRate,
  currencySymbol,
  decimalSeparator,
} from '@b2b-catalog-platform/shared';
import {
  isValidPartList,
  minimumFitsPacks,
  piecesPerUnit,
  ProductAttribute,
  DEFAULT_LOW_STOCK_THRESHOLD_PIECES,
  ProductAvailability,
  productAvailability,
  ProductDetail,
  lowStockThreshold,
  splitAttributeKey,
  totalMinor,
} from '@b2b-catalog-platform/shared/core/catalog';
import {
  AdminCategory,
  AdminProduct,
  AttributeDefinition,
  AttributeKeyUsage,
  CustomerTier,
  LinkedDocument,
  LinkedProduct,
  ProductImageInput,
  ProductInput,
  ProductVariantInput,
  PRODUCT_LINE_NOTE_PROMPT_MAX_LENGTH,
} from '@b2b-catalog-platform/shared/admin/catalog';
import {
  hasDistinctVariants,
  shownPictures,
  slugify,
} from '@b2b-catalog-platform/shared/core/catalog';
import {
  formatPriceInput,
  parsePriceInput,
  partialPriceRule,
} from '../../../core/catalog/pricing/price';
import { LockedNote } from '../../ownership/locked-note';
import { Allow } from '@b2b-catalog-platform/ui/inputs/allow';
import { StatusBadge } from '@b2b-catalog-platform/ui/content/status-badge';
import { LockedFieldMarker } from '../../ownership/locked-field-marker';
import { OwnershipService } from '../../settings/ownership.service';
import { ProductAvailabilityBadge } from '../../../core/catalog/ui/product-availability-badge';
import { formatStoredDecimal } from '../../../core/catalog/buying/quantity';
import { ProductDetailView } from '../../../core/catalog/product-page/ui/product-detail-view';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../../shared/config/deployment-config';
import { delayedLoading } from '../../../shared/core/delayed-loading';
import { filled } from '../../../shared/core/field-rules';
import { usePageSeo } from '../../../shared/core/page-seo';
import { UnsavedChangesAware } from '../../unsaved-changes.guard';
import { UnsavedChanges } from '../../unsaved-changes';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Notice } from '@b2b-catalog-platform/ui/content/notice';
import { Checkbox } from '@b2b-catalog-platform/ui/choices/checkbox';
import { TickLabel } from '@b2b-catalog-platform/ui/choices/tick-label';
import { ConfirmService } from '@b2b-catalog-platform/ui/overlay/confirm.service';
import {
  FieldAttempt,
  FIELD_ATTEMPT,
} from '@b2b-catalog-platform/ui/fields/field-attempt';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { FORM_FIELDS } from '@b2b-catalog-platform/ui/fields/form-fields';
import { submitAttempt } from '@b2b-catalog-platform/ui/fields/submit-attempt';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { PRODUCT_FEATURE_GLYPHS } from './product-feature-glyphs';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { CategoriesService } from '../categories/categories.service';
import { ProductsService, type ProductSaveErrorCode } from './products.service';
import { AttributesService } from '../attributes/attributes.service';
import { CategoryPicker } from '../categories/category-picker';
import { categoryAncestors } from '../categories/category-tree';
import { injectEditorReturn } from '../../../shared/edit-mode/editor-return';
import { RichTextEditor } from '../../rich-text/rich-text-editor';
import { TiersService } from '../tiers/tiers.service';
import { ProductAttributesEditor } from './product-attributes-editor';
import { ProductPartsEditor } from './product-parts-editor';
import { FeatureDisclosure } from './feature-disclosure';
import { ProductVariantsEditor } from './product-variants-editor';
import { ProductImageGallery } from './product-image-gallery';
import { ProductDocumentsEditor } from '../documents/product-documents-editor';
import { ProductPairingsEditor } from './product-pairings-editor';
import {
  emptyPackaging,
  PackagingDraft,
  parseCount,
  ProductPackagingEditor,
} from './product-packaging-editor';
import {
  ProductTierPricesEditor,
  TierPriceDraft,
} from './product-tier-prices-editor';
import { UnitInput } from '@b2b-catalog-platform/ui/inputs/unit-input';
import { UnitInputControl } from '@b2b-catalog-platform/ui/inputs/unit-input-control';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { circleCheckIcon } from '@b2b-catalog-platform/ui/icons/glyphs/circle-check';
import { eyeIcon } from '@b2b-catalog-platform/ui/icons/glyphs/eye';
import { pencilIcon } from '@b2b-catalog-platform/ui/icons/glyphs/pencil';
import { numericRules } from '@b2b-catalog-platform/ui/inputs/numeric-rules';
import { SaveButton } from '../../ui/save-button';
import { CancelButton } from '../../ui/cancel-button';

/** Packaging with no pack and no box, for the reads that need only those. */
const NO_PACKAGING = { piecesPerPack: null, packsPerBox: null };

interface ProductDraft {
  name: string;
  slug: string;
  /** Prices and counts as typed, so a half-typed figure survives. */
  price: string;
  taxRate: string;
  categoryId: string;
  sourceId: string;
  stockPieces: string;
  lowStockThreshold: string;
  lineNotePrompt: string;
  /** One per tier other than the storefront's; empty uses the base price. */
  tierPrices: TierPriceDraft[];
  packaging: PackagingDraft;
  parts: string[];
  variants: ProductVariantInput[];
}

/**
 * A product (FR-ADM-01), new without a `:slug`: one save, an unsaved-changes
 * guard, a preview through the storefront's own view, and a slug that follows
 * the name until it is typed.
 */
@Component({
  selector: 'app-product-editor-page',
  imports: [
    CancelButton,
    SaveButton,
    FORM_FIELDS,
    LockedNote,
    Button,
    Icon,
    RichTextEditor,
    Allow,
    ProductAvailabilityBadge,
    CategoryPicker,
    ProductAttributesEditor,
    ProductPartsEditor,
    FeatureDisclosure,
    ProductVariantsEditor,
    ProductPackagingEditor,
    ProductDocumentsEditor,
    ProductPairingsEditor,
    ProductTierPricesEditor,
    ProductImageGallery,
    ProductDetailView,
    Checkbox,
    TickLabel,
    FieldLabel,
    Input,
    Skeleton,
    UnitInput,
    LockedFieldMarker,
    StatusBadge,
    PageTitle,
    ErrorText,
    UnitInputControl,
    Notice,
  ],
  // No <form>: the page itself says when the form has been sent.
  providers: [
    {
      provide: FIELD_ATTEMPT,
      useExisting: forwardRef(() => ProductEditorPage),
    },
  ],
  template: `
    <div class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <h1 uiPageTitle>
        {{ isNew ? text.newTitle : text.editTitle }}
      </h1>
      <!-- Deleted alone where it applies: restoring is the only way back
           (FR-ADM-01). The price badge follows the field, which is what the
           product will be after a save. -->
      @if (!isNew && !loading() && !notFound()) {
        @if (deleted()) {
          <span uiStatusBadge tone="danger">{{ productStates.deleted }}</span>
        } @else {
          @if (!published()) {
            <span uiStatusBadge tone="waiting">{{
              productStates.unpublished
            }}</span>
          }
          @if (priceCleared()) {
            <span uiStatusBadge tone="danger">{{
              productStates.unpriced
            }}</span>
          }
        }
      }
    </div>

    @if (loading()) {
      @if (showSkeleton()) {
        <ui-skeleton [lines]="4" />
      }
    } @else if (notFound()) {
      <p class="text-ink-subtle" role="alert">{{ text.saveError }}</p>
    } @else if (newAndOwned()) {
      <!-- Creating writes every owned field, so there is nothing to offer;
           this screen is where the ways in explain why. -->
      <app-locked-note>{{ ownershipText.productCreate }}</app-locked-note>
    } @else if (previewing()) {
      <p uiNotice tone="neutral" class="mb-6" role="status">
        {{ text.previewNotice }}
      </p>
      <app-product-detail-view [item]="previewItem()" [canAdd]="false" />
    } @else {
      <div class="max-w-3xl space-y-6">
        @if (catalogOwned()) {
          <app-locked-note>{{ ownershipText.fieldLocked }}</app-locked-note>
        }

        <ui-field
          [field]="form.name"
          [label]="text.name"
          controlId="product-name"
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

        <!-- A grid, so the notes under the price are a row of their own rather
             than growing its column; the picker is placed explicitly, so on a
             phone the notes read under the price. -->
        <div
          class="grid gap-6 sm:grid-cols-[10.875rem_4.6875rem_minmax(0,1fr)]"
        >
          <!-- Named after its price list, the one the storefront quotes. -->
          <ui-field
            class="w-full sm:w-auto"
            [field]="form.price"
            [label]="priceLabel()"
            controlId="product-price"
          >
            <app-locked-field-marker uiFieldCaption [field]="form.price" />
            <!-- Text, not number: a number input reports "18." as empty,
                 which wiped the field at the decimal separator. -->
            <ui-unit-input class="w-full sm:w-43.5" [unit]="currencySuffix">
              <input
                type="text"
                inputmode="decimal"
                [uiAllow]="partialPrice"
                uiUnitInputControl
                [placeholder]="pricePlaceholder"
                [formField]="form.price"
                (blur)="onPriceBlur()"
              />
            </ui-unit-input>
          </ui-field>

          <!-- Wide enough for "12.75"; empty is the default, shown as the
               placeholder. -->
          <ui-field
            class="w-full"
            [field]="form.taxRate"
            [label]="text.taxRate.label"
            controlId="product-tax-rate"
          >
            <app-locked-field-marker uiFieldCaption [field]="form.taxRate" />
            <ui-unit-input class="w-full" unit="%" [compact]="true">
              <input
                type="text"
                inputmode="decimal"
                [uiAllow]="isPartialTaxRate"
                uiUnitInputControl
                [placeholder]="taxRatePlaceholder"
                [formField]="form.taxRate"
              />
            </ui-unit-input>
          </ui-field>

          <!-- At the fields, not only on the button, which is read after the
               price was cleared. Across all three columns, so appearing
               mid-edit moves nothing. -->
          @if ((priceCleared() && published()) || taxRateNotInEffect) {
            <div class="-mt-4 space-y-1 text-sm sm:col-span-3 sm:row-start-2">
              @if (priceCleared() && published()) {
                <p class="text-warning">{{ text.priceCleared }}</p>
              }
              @if (taxRateNotInEffect) {
                <p class="text-xs text-ink-subtle">
                  {{ text.taxRate.notInEffect }}
                </p>
              }
            </div>
          }

          <ui-field
            class="w-full sm:col-start-3 sm:row-start-1 sm:w-auto"
            [field]="form.categoryId"
            [label]="text.category"
            controlId="product-category"
          >
            <app-locked-field-marker uiFieldCaption [field]="form.categoryId" />
            <app-category-picker
              [categories]="categories()"
              [field]="form.categoryId"
              [placeholder]="text.categoryPlaceholder"
            />
          </ui-field>
        </div>

        @if (otherTiers().length > 0) {
          <div>
            <app-product-tier-prices-editor
              [tiers]="otherTiers()"
              [basePrice]="basePriceText()"
              [field]="form.tierPrices"
            />
          </div>
        }

        <div class="grid gap-6 sm:grid-cols-2">
          <ui-field
            [field]="form.slug"
            [label]="text.slug"
            [hint]="text.slugHint"
            controlId="product-slug"
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
            controlId="product-source-id"
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
          <span uiFieldLabel>{{ product.description }}</span>
          <app-rich-text-editor
            preset="product"
            [value]="description()"
            (contentChange)="description.set($event)"
          />
        </div>

        <div>
          <app-product-attributes-editor
            [value]="attributes()"
            [knownKeys]="attributeKeys()"
            [definitions]="attributeDefinitions()"
            [ownKeys]="ownAttributeKeys()"
            [parts]="parts()"
            (valueChange)="attributes.set($event)"
          />
        </div>

        <div>
          <app-product-packaging-editor
            [value]="packaging()"
            [priceMinor]="packagingPriceMinor()"
            [error]="packagingError()"
            (valueChange)="form.packaging().value.set($event)"
          />
        </div>

        <fieldset class="max-w-xl">
          <legend uiFieldLabel>{{ text.stock.heading }}</legend>
          @if (!catalogOwned()) {
            <p class="mb-2 text-xs text-ink-subtle">{{ text.stock.hint }}</p>
          }
          <div class="grid gap-4 sm:grid-cols-2">
            <ui-field
              [field]="form.stockPieces"
              [label]="text.stock.pieces"
              controlId="product-stock"
            >
              <app-locked-field-marker
                uiFieldCaption
                [field]="form.stockPieces"
              />
              <ui-unit-input class="w-full" [unit]="pieceSuffix">
                <input
                  type="text"
                  [uiAllow]="numericRules.signed"
                  uiUnitInputControl
                  [formField]="form.stockPieces"
                />
              </ui-unit-input>
            </ui-field>
            <!-- Empty works it out from the packaging; that figure is the
                 placeholder. -->
            <ui-field
              [field]="form.lowStockThreshold"
              [label]="text.stock.threshold"
              controlId="product-threshold"
            >
              <ui-unit-input class="w-full" [unit]="pieceSuffix">
                <input
                  type="text"
                  [uiAllow]="numericRules.integer"
                  uiUnitInputControl
                  [placeholder]="thresholdPlaceholder()"
                  [formField]="form.lowStockThreshold"
                />
              </ui-unit-input>
            </ui-field>
          </div>
          <!-- The badge a customer will see. As tall as the pill either way,
               so it appearing nudges nothing. -->
          <p
            class="mt-3 flex min-h-5.5 items-center gap-2 text-xs
                   text-ink-subtle"
          >
            <span>{{ text.stock.preview }}</span>
            @if (previewAvailability(); as state) {
              <app-product-availability-badge [availability]="state" />
            } @else {
              <span>{{ text.stock.untracked }}</span>
            }
          </p>
        </fieldset>

        <!-- The optional extras, in the grid's glyph order. All six stay the
             shop's while the catalog is owned. -->
        <app-feature-disclosure
          [label]="text.featured.heading"
          [glyph]="glyphs.featured"
          [on]="featured()"
        >
          <p class="mb-2 text-xs text-ink-subtle">{{ text.featured.hint }}</p>
          <label uiTickLabel>
            <input
              type="checkbox"
              uiCheckbox
              [checked]="featured()"
              (change)="featured.set($any($event.target).checked)"
            />
            <span>{{ text.featured.enable }}</span>
          </label>
        </app-feature-disclosure>

        <app-product-variants-editor
          [value]="variants()"
          [images]="images()"
          (valueChange)="setVariants($event)"
        />

        <!-- Its own box: the first variant switches it on, but it stands
             without variants too. -->
        <app-feature-disclosure
          [label]="text.lineNote.heading"
          [glyph]="glyphs.note"
          [on]="lineNoteEnabled()"
        >
          <p class="mb-2 text-xs text-ink-subtle">{{ text.lineNote.hint }}</p>
          <label uiTickLabel>
            <input
              type="checkbox"
              uiCheckbox
              [checked]="lineNoteEnabled()"
              (change)="onLineNoteToggle($any($event.target).checked)"
            />
            <span>{{ text.lineNote.enable }}</span>
          </label>
          @if (lineNoteEnabled()) {
            <ui-field
              class="mt-3"
              [field]="form.lineNotePrompt"
              [label]="text.lineNote.prompt"
              [hint]="text.lineNote.promptHint"
              controlId="product-line-note-prompt"
            >
              <input
                type="text"
                uiInput
                class="w-full"
                [placeholder]="text.lineNote.promptPlaceholder"
                [formField]="form.lineNotePrompt"
              />
            </ui-field>
          }
        </app-feature-disclosure>

        <app-product-parts-editor
          [value]="parts()"
          (valueChange)="form.parts().value.set($event)"
        />

        <app-product-pairings-editor
          [value]="pairings()"
          [ownSlug]="isNew ? null : slug()"
          (valueChange)="pairings.set($event)"
        />

        <app-product-documents-editor
          [value]="documents()"
          (valueChange)="documents.set($event)"
        />

        <div>
          <app-product-image-gallery
            [value]="images()"
            [variants]="variants()"
            (valueChange)="images.set($event)"
          />
        </div>
      </div>
    }

    @if (error()) {
      <p uiErrorText class="mt-4" role="alert">{{ error() }}</p>
    }

    @if (!loading() && !notFound()) {
      <div class="mt-6 flex max-w-3xl flex-wrap gap-3">
        @if (!newAndOwned()) {
          <button
            uiButton
            appSaveButton
            type="button"
            [saving]="saving()"
            (click)="save()"
          >
            {{ saveLabel() }}
          </button>
        }
        <!-- Not without a price, which the server would refuse, nor on a
             deleted product, restored first (FR-ADM-01). -->
        @if (!published() && !deleted() && !newAndOwned() && !priceCleared()) {
          <button
            uiButton
            variant="secondary"
            type="button"
            class="gap-2"
            [disabled]="saving()"
            (click)="save(true)"
          >
            <ui-icon [glyph]="circleCheckIcon" class="size-4" />
            {{ text.saveAndPublish }}
          </button>
        }
        @if (!newAndOwned()) {
          <button
            uiButton
            variant="secondary"
            type="button"
            class="gap-2"
            (click)="previewing.set(!previewing())"
          >
            <ui-icon
              [glyph]="previewing() ? pencilIcon : eyeIcon"
              class="size-4"
            />
            {{
              previewing()
                ? adminText.actions.resumeEditing
                : adminText.actions.preview
            }}
          </button>
        }
        <button
          uiButton
          variant="secondary"
          appCancelButton
          type="button"
          (click)="cancel()"
        >
          {{ actionText.cancel }}
        </button>
        <!-- Cancel goes back where the editor was opened; this discards the
             same way and lands on the product's page (FR-ADM-06). -->
        @if (!isNew) {
          <button
            uiButton
            variant="secondary"
            type="button"
            class="gap-2"
            (click)="cancelToPage()"
          >
            <ui-icon [glyph]="eyeIcon" class="size-4" />
            {{ text.cancelToPage }}
          </button>
        }
      </div>
    }
  `,
})
export class ProductEditorPage implements UnsavedChangesAware, FieldAttempt {
  protected readonly numericRules = numericRules;
  protected readonly circleCheckIcon = circleCheckIcon;
  protected readonly eyeIcon = eyeIcon;
  protected readonly pencilIcon = pencilIcon;
  private readonly productsService = inject(ProductsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly tiersService = inject(TiersService);
  private readonly attributesService = inject(AttributesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly currency = moneyFormat(inject(DEPLOYMENT_CONFIG));
  private readonly locale = inject(DEPLOYMENT_CONFIG).locale;
  private readonly tax = inject(DEPLOYMENT_CONFIG).tax;
  /** The last rung of the "few left" ladder; the API applies the same figure
   * from the same key. */
  private readonly lowStockFallback =
    inject(DEPLOYMENT_CONFIG).catalog.lowStockThresholdPieces ??
    DEFAULT_LOW_STOCK_THRESHOLD_PIECES;
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly text = inject(ADMIN_TEXT).products.editor;
  protected readonly glyphs = PRODUCT_FEATURE_GLYPHS;
  protected readonly ownershipText = inject(ADMIN_TEXT).ownership;
  protected readonly editText = inject(ADMIN_TEXT).editMode;
  protected readonly product = inject(SHARED_TEXT).product;
  protected readonly productStates = inject(ADMIN_TEXT).products;
  private readonly ownership = inject(OwnershipService);

  /** FR-ADM-10. Unknown reads as not owned: the form waits for the answer,
   * and the API refuses either way. */
  protected readonly catalogOwned = computed(
    () => this.ownership.ownedAreas()?.includes('catalog') ?? false,
  );

  /** The "new" route with nothing to create on it. */
  protected readonly newAndOwned = computed(
    () => this.isNew && this.catalogOwned(),
  );
  protected readonly pieceSuffix = inject(SHARED_TEXT).units.piece;
  protected readonly actionText = inject(SHARED_TEXT).actions;

  private readonly slugParam = this.route.snapshot.paramMap.get('slug');
  protected readonly isNew = this.slugParam === null;

  protected readonly loading = signal(true);
  protected readonly showSkeleton = delayedLoading(this.loading);
  protected readonly notFound = signal(false);
  protected readonly categories = signal<AdminCategory[]>([]);
  protected readonly tiers = signal<CustomerTier[]>([]);
  protected readonly attributeKeys = signal<AttributeKeyUsage[]>([]);
  protected readonly attributeDefinitions = signal<AttributeDefinition[]>([]);
  /** The stored keys, left out of the grid's counts. */
  protected readonly ownAttributeKeys = signal<string[]>([]);

  /** A new record follows its name; an emptied box stays empty until the name
   * is next edited, then follows it. */
  private readonly slugSource = signal<'typed' | 'emptied' | 'name'>(
    this.isNew ? 'name' : 'typed',
  );
  protected readonly description = signal('');
  protected readonly attributes = signal<ProductAttribute[]>([]);
  protected readonly images = signal<ProductImageInput[]>([]);
  protected readonly pairings = signal<LinkedProduct[]>([]);
  protected readonly documents = signal<LinkedDocument[]>([]);
  /** Offered first to the main page's row (FR-CAT-09). */
  protected readonly featured = signal(false);
  protected readonly lineNoteEnabled = signal(false);

  private readonly model = signal<ProductDraft>({
    name: '',
    slug: '',
    price: '',
    taxRate: '',
    categoryId: '',
    sourceId: '',
    stockPieces: '',
    lowStockThreshold: '',
    lineNotePrompt: '',
    tierPrices: [],
    packaging: emptyPackaging(),
    parts: [],
    variants: [],
  });

  protected readonly form = form(
    this.model,
    (product) => {
      // Only the fields an exchange writes.
      const owned = {
        when: () => this.catalogOwned() && this.ownershipText.fieldLockedShort,
      };
      for (const path of [
        product.name,
        product.price,
        product.taxRate,
        product.categoryId,
        product.sourceId,
        product.stockPieces,
      ]) {
        disabled(path, owned);
      }
      disabled(product.tierPrices, owned);
      filled(product.name, this.text.nameRequired);
      required(product.categoryId, { message: this.text.categoryRequired });
      // An empty field is "no price", a real state; anything else that will
      // not parse is a typo.
      validate(product.price, ({ value }) =>
        value().trim() && parsePriceInput(value(), this.currency) === null
          ? { kind: 'price', message: this.text.priceInvalid }
          : undefined,
      );
      validate(product.taxRate, ({ value }) =>
        parseTaxRate(value()) === undefined
          ? { kind: 'taxRate', message: this.text.taxRate.invalid }
          : undefined,
      );
      // Nothing to measure "few left" against while the stock is untracked.
      disabled(product.lowStockThreshold, {
        when: () => this.parsedStockPieces() === null,
      });
      maxLength(product.lineNotePrompt, PRODUCT_LINE_NOTE_PROMPT_MAX_LENGTH);
      // Each tier against its own name: "invalid price" on a screen with
      // several price fields does not say which one.
      applyEach(product.tierPrices, (draft) => {
        validate(draft.value, ({ value, valueOf }) => {
          if (parsePriceInput(value(), this.currency) !== null)
            return undefined;
          if (!value().trim()) return undefined;
          const tier = this.tiers().find((t) => t.id === valueOf(draft.tierId));
          return {
            kind: 'price',
            message: fillText(this.text.tierPrices.invalid, {
              tier: tier?.label ?? '',
            }),
          };
        });
      });
      validate(product.packaging, () => {
        const packaging = this.packagingInput();
        if (packaging === null) {
          return { kind: 'packaging', message: this.text.packaging.invalid };
        }
        return minimumFitsPacks(packaging)
          ? undefined
          : { kind: 'minimum', message: this.text.packaging.minMustFitPacks };
      });
      validate(product.parts, ({ value }) =>
        isValidPartList(value())
          ? undefined
          : { kind: 'parts', message: this.text.parts.tooFew },
      );
      validate(product.variants, ({ value }) =>
        value().some((variant) => variant.name.trim() === '') ||
        !hasDistinctVariants(value())
          ? { kind: 'variants', message: this.text.variants.duplicate }
          : undefined,
      );
    },
    { name: 'product-editor' },
  );

  // Views of the model for the rest of the page; writes go through the form.
  protected readonly name = computed(() => this.model().name);
  protected readonly slug = computed(() => this.model().slug);
  protected readonly priceInput = computed(() => this.model().price);
  protected readonly taxRateInput = computed(() => this.model().taxRate);
  protected readonly categoryId = computed(() => this.model().categoryId);
  protected readonly sourceId = computed(() => this.model().sourceId);
  protected readonly stockPieces = computed(() => this.model().stockPieces);
  protected readonly lowStockThresholdInput = computed(
    () => this.model().lowStockThreshold,
  );
  protected readonly lineNotePrompt = computed(
    () => this.model().lineNotePrompt,
  );
  protected readonly tierPrices = computed(() => this.model().tierPrices);
  protected readonly packaging = computed(() => this.model().packaging);
  protected readonly parts = computed(() => this.model().parts);
  protected readonly partsValid = computed(() => isValidPartList(this.parts()));
  protected readonly variants = computed(() => this.model().variants);

  /** Once a save has asked: the editor corrects most of it on blur. */
  protected readonly packagingError = computed(() =>
    submitAttempt(this.form)()
      ? (this.form.packaging().errors()[0]?.message ?? null)
      : null,
  );
  protected readonly isPartialTaxRate = isPartialTaxRate;
  protected readonly partialPrice = partialPriceRule(this.currency);
  protected readonly taxRatePlaceholder =
    this.tax.basis === 'none' ? '' : formatTaxRate(this.tax.rate, this.locale);
  /** Under a basis that charges no tax, a rate is kept but applies to
   * nothing yet. */
  protected readonly taxRateNotInEffect = this.tax.basis === 'none';

  protected readonly published = signal(false);
  /** Still editable, with a badge saying so. */
  protected readonly deleted = signal(false);
  protected readonly previewing = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly unsaved = new UnsavedChanges(() => this.snapshot());
  private readonly close = injectEditorReturn();

  readonly attempted = computed(() => submitAttempt(this.form)());
  private readonly partsEditor = viewChild(ProductPartsEditor);
  private readonly variantsEditor = viewChild(ProductVariantsEditor);
  private readonly injector = inject(Injector);

  /** The shape of a price here, e.g. "0,00" in a de-DE deployment. */
  protected readonly pricePlaceholder = `0${decimalSeparator(this.currency)}00`;
  protected readonly currencySuffix = currencySymbol(this.currency);

  /** What an emptied tier charges, formatted, so a half-typed "18," shows the
   * "18,00" it saves as. */
  protected readonly basePriceText = computed(() => {
    if (this.priceCleared()) return '';
    const minor = parsePriceInput(this.priceInput(), this.currency);
    return minor === null ? '' : formatPriceInput(minor, this.currency);
  });

  private readonly defaultTier = computed(() =>
    this.tiers().find((t) => t.isDefault),
  );

  protected readonly priceLabel = computed(() =>
    fillText(this.text.priceWithList, {
      list: this.defaultTier()?.label ?? '',
    }),
  );

  /** The storefront's list is the price field above, not a row below. */
  protected readonly otherTiers = computed(() =>
    this.tiers().filter((t) => !t.isDefault),
  );

  /** No price, a state the catalog holds: off the storefront. Zero is the same
   * state, never a free product, so 0,00 reads as a cleared field. */
  protected readonly priceCleared = computed(() => {
    const text = this.priceInput().trim();
    return text === '' || parsePriceInput(text, this.currency) === 0;
  });

  /** Clearing a published product's price takes it off sale in the same
   * write, and the button says so. */
  protected readonly saveLabel = computed(() =>
    this.priceCleared() && this.published()
      ? this.text.saveAndUnpublish
      : this.adminText.actions.save,
  );

  /** A zero is no price, which this form writes as an empty field. */
  protected onPriceBlur(): void {
    if (parsePriceInput(this.priceInput(), this.currency) === 0) {
      this.form.price().value.set('');
    }
  }

  /** Matched as the server does: exactly but for whitespace (FR-ATTR-02), and
   * without a set's part (FR-CAT-10). */
  private unitFor(key: string): string | null {
    const name = splitAttributeKey(key, this.parts()).key;
    return (
      this.attributeDefinitions().find((d) => d.name === name)?.unit ?? null
    );
  }

  /** Null is untracked, not zero. Negative is allowed: a stocktake correction
   * reads as out of stock. */
  protected readonly parsedStockPieces = computed(() => {
    const text = this.stockPieces().trim();
    return /^-?\d+$/.test(text) ? Number(text) : null;
  });

  /** The product's own rate, null for the default, undefined if unreadable. */
  private readonly parsedTaxRate = computed(() =>
    parseTaxRate(this.taxRateInput()),
  );

  /** The product's own "few left" line, or null to use the ladder. */
  protected readonly parsedThreshold = computed(() => {
    const text = this.lowStockThresholdInput().trim();
    if (!/^\d+$/.test(text)) return null;
    const value = Number(text);
    return value >= 1 ? value : null;
  });

  /** The API's own function, so the preview cannot disagree with the save. */
  protected readonly previewAvailability = computed<ProductAvailability | null>(
    () =>
      productAvailability(
        this.parsedStockPieces(),
        this.packagingInput() ?? NO_PACKAGING,
        this.parsedThreshold(),
        this.lowStockFallback,
      ),
  );

  /** The threshold in force. None while untracked: in a disabled field it
   * would read as a value. */
  protected readonly thresholdPlaceholder = computed(() =>
    this.parsedStockPieces() === null
      ? ''
      : String(
          lowStockThreshold(
            this.packagingInput() ?? NO_PACKAGING,
            this.parsedThreshold(),
            this.lowStockFallback,
          ),
        ),
  );

  protected readonly previewPriceMinor = computed(
    () => parsePriceInput(this.priceInput(), this.currency) ?? 0,
  );

  /** Null rather than quoting a pack at zero. */
  protected readonly packagingPriceMinor = computed(() =>
    this.priceCleared()
      ? null
      : parsePriceInput(this.priceInput(), this.currency),
  );

  /** The form as a ProductDetail, for the storefront's own view. */
  protected readonly previewItem = computed<ProductDetail>(() => {
    const category = this.categories().find((c) => c.id === this.categoryId());
    const stored = this.previewPriceMinor();
    // Piece-only while a packaging field is half-typed, so it keeps rendering.
    const packaging = this.packagingInput() ?? {
      ...NO_PACKAGING,
      minPieceQty: 1,
      boxVolume: null,
      boxWeight: null,
      boxCount: 1,
    };
    const priceFor = (unit: 'pack' | 'box') => {
      const pieces = piecesPerUnit(packaging, unit);
      return pieces === null ? null : totalMinor(stored, pieces);
    };
    return {
      slug: this.slug(),
      name: this.name(),
      priceMinor: stored,
      prices: {
        piece: stored,
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
          : {
              volume: packaging.boxVolume,
              weight: packaging.boxWeight,
              count: packaging.boxCount,
            },
      descriptionHtml: this.description(),
      // FR-CAT-11/12: unavailable variants' pictures withheld.
      images: shownPictures(this.images(), this.variants()),
      variants: this.variants().map(({ name, unavailable }) => ({
        name: name.trim(),
        unavailable,
      })),
      lineNoteEnabled: this.lineNoteEnabled(),
      lineNotePrompt: this.lineNotePrompt().trim() || null,
      availability: this.previewAvailability(),
      taxRate: effectiveTaxRate(this.tax, this.parsedTaxRate() ?? null),
      // Counted as the storefront does: only counterparts on offer.
      pairedCount: this.pairings().filter(
        (paired) => !paired.deleted && !paired.unpublished,
      ).length,
      parts: this.partsValid() ? this.parts() : [],
      // The form holds links, not the files the section is drawn from.
      documents: [],
      // No filter link: it would leave the half-saved product.
      attributes: this.attributes()
        .filter((a) => a.key.trim() !== '' || a.value.trim() !== '')
        .map((a) => ({ ...a, unit: this.unitFor(a.key), filterSlug: null })),
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

  constructor() {
    usePageSeo({
      name: () => (this.isNew ? this.text.newTitle : this.text.editTitle),
    });
    // A following slug is kept in the model, so the field shows it.
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
    const [categories, tiers, attributeKeys, definitions] = await Promise.all([
      this.categoriesService.list(),
      this.tiersService.list().then((r) => r.tiers),
      // A convenience beside the grid: a failure must not cost the editor.
      this.attributesService.listKeys().catch(() => []),
      this.attributesService.list().catch(() => []),
      // With the rest: the "new" route turns on it, and must not flash a form.
      this.ownership.load(),
    ]);
    this.categories.set(categories);
    this.tiers.set(tiers);
    this.attributeKeys.set(attributeKeys);
    this.attributeDefinitions.set(definitions);
    const existingSlug = this.slugParam;
    if (existingSlug !== null) {
      const product = await this.productsService.get(existingSlug);
      if (!product) {
        this.notFound.set(true);
        this.loading.set(false);
        return;
      }
      this.description.set(product.descriptionHtml);
      this.attributes.set(product.attributes);
      // The names the rest of the catalog counts: "Colour", not "Colour (cup)".
      this.ownAttributeKeys.set(
        product.attributes.map(
          (a) => splitAttributeKey(a.key, product.parts).key,
        ),
      );
      this.images.set(product.images);
      this.published.set(product.publishedAt !== null);
      this.deleted.set(product.deletedAt !== null);
      this.pairings.set(product.pairings);
      this.documents.set(product.documents);
      this.featured.set(product.featured);
      this.lineNoteEnabled.set(product.lineNoteEnabled);
      const stored = new Map(
        product.tierPrices.map((p) => [p.tierId, p.priceMinor]),
      );
      this.model.set({
        name: product.name,
        slug: product.slug,
        price:
          product.priceMinor === null
            ? ''
            : formatPriceInput(product.priceMinor, this.currency),
        taxRate:
          product.taxRate === null
            ? ''
            : formatTaxRate(product.taxRate, this.locale),
        categoryId: product.categoryId,
        sourceId: product.sourceId,
        stockPieces: product.stockPieces?.toString() ?? '',
        lowStockThreshold: product.lowStockThresholdPieces?.toString() ?? '',
        lineNotePrompt: product.lineNotePrompt ?? '',
        tierPrices: this.otherTiers().map((tier) => {
          const minor = stored.get(tier.id);
          return {
            tierId: tier.id,
            value:
              minor === undefined ? '' : formatPriceInput(minor, this.currency),
          };
        }),
        packaging: {
          piecesPerPack: product.piecesPerPack?.toString() ?? '',
          packsPerBox: product.packsPerBox?.toString() ?? '',
          minPieceQty: product.minPieceQty.toString(),
          boxVolume: this.showDecimal(product.boxVolume),
          boxWeight: this.showDecimal(product.boxWeight),
          boxCount:
            product.packsPerBox === null ? '' : product.boxCount.toString(),
        },
        parts: product.parts,
        variants: product.variants,
      });
    } else {
      // "Add product here" preselects the category, before the snapshot so it
      // is no unsaved change.
      const categorySlug = this.route.snapshot.queryParamMap.get('category');
      const match = this.categories().find((c) => c.slug === categorySlug);
      this.model.update((draft) => ({
        ...draft,
        categoryId: match?.id ?? '',
        tierPrices: this.otherTiers().map((tier) => ({
          tierId: tier.id,
          value: '',
        })),
      }));
    }
    this.unsaved.loaded();
    this.loading.set(false);
  }

  /** A row with no value states nothing, as the server reads it too: the
   * picker's unfilled rows are not saved. */
  private storedAttributes(): ProductAttribute[] {
    return this.attributes().filter(
      (a) => a.key.trim() !== '' && a.value.trim() !== '',
    );
  }

  private snapshot(): string {
    return JSON.stringify({
      ...this.model(),
      description: this.description(),
      attributes: this.attributes(),
      images: this.images(),
      pairings: this.pairings(),
      documents: this.documents(),
      featured: this.featured(),
      lineNoteEnabled: this.lineNoteEnabled(),
    });
  }

  /** With the deployment's separator, like a price, and nothing else touched,
   * so the digits typed survive a round trip. */
  private showDecimal(stored: string | null): string {
    return stored === null ? '' : formatStoredDecimal(stored, this.currency);
  }

  /** As the contract wants it, or null while a count is not whole. Blank is
   * "not sold that way", and 1 for the minimum. */
  private packagingInput(): {
    piecesPerPack: number | null;
    packsPerBox: number | null;
    minPieceQty: number;
    boxVolume: string | null;
    boxWeight: string | null;
    boxCount: number;
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
    const boxCount = required(draft.boxCount);
    if (
      piecesPerPack === undefined ||
      packsPerBox === undefined ||
      minPieceQty === undefined ||
      boxCount === undefined
    ) {
      return null;
    }

    return {
      piecesPerPack,
      packsPerBox: piecesPerPack === null ? null : packsPerBox,
      minPieceQty,
      // Either separator while typing, like a price.
      boxVolume: packsPerBox === null ? null : decimal(draft.boxVolume),
      boxWeight: packsPerBox === null ? null : decimal(draft.boxWeight),
      boxCount: packsPerBox === null ? 1 : boxCount,
    };
  }

  /** A deleted variant's pictures stay, showing none (FR-CAT-12). */
  protected setVariants(next: ProductVariantInput[]): void {
    const ids = new Set(next.map((variant) => variant.id));
    // Colours are nearly always named so a customer can ask for one; it can
    // be switched off for goods sold assorted only.
    if (this.variants().length === 0 && next.length > 0) {
      this.lineNoteEnabled.set(true);
    }
    this.form.variants().value.set(next);
    this.images.update((images) =>
      images.map((image) =>
        image.variantId !== null && !ids.has(image.variantId)
          ? { ...image, variantId: null }
          : image,
      ),
    );
  }

  /** The prompt goes with the note, as a save would store it. */
  protected onLineNoteToggle(enabled: boolean): void {
    this.lineNoteEnabled.set(enabled);
    if (!enabled) this.form.lineNotePrompt().value.set('');
  }

  protected onSlugInput(value: string): void {
    this.slugSource.set(value.trim() ? 'typed' : 'emptied');
  }

  protected onNameInput(): void {
    if (this.slugSource() === 'emptied') this.slugSource.set('name');
  }

  /** Back from the preview to the field, or the list's box opened. */
  private revealFirstError(): void {
    const first = this.form().errorSummary()[0]?.fieldTree;
    if (!first) return;
    this.previewing.set(false);
    afterNextRender(
      () => {
        if (first === this.form.parts) this.partsEditor()?.reveal();
        else if (first === this.form.variants) this.variantsEditor()?.reveal();
        else first().focusBoundControl();
      },
      { injector: this.injector },
    );
  }

  private refusalText(code: ProductSaveErrorCode, creating: boolean): string {
    if (code !== 'catalog-externally-owned') {
      return this.adminText.catalogErrors[code];
    }
    return creating
      ? this.ownershipText.productCreate
      : this.ownershipText.fieldLocked;
  }

  protected async save(andPublish = false): Promise<void> {
    submitAttempt(this.form).set(true);
    if (this.form().invalid()) return this.revealFirstError();

    const priceMinor = this.priceCleared()
      ? null
      : parsePriceInput(this.priceInput(), this.currency);
    const tierPrices = [];
    for (const draft of this.tierPrices()) {
      const tierMinor = parsePriceInput(draft.value, this.currency);
      // Empty or zero: charged the storefront's price.
      if (!tierMinor) continue;
      tierPrices.push({ tierId: draft.tierId, priceMinor: tierMinor });
    }
    // Field by field: the form keeps an identity of its own on each item.
    const variants = this.variants().map(({ id, name, unavailable }) => ({
      id,
      name: name.trim(),
      unavailable,
    }));
    // The rules above have read both; neither is null or undefined here.
    const taxRate = this.parsedTaxRate() ?? null;
    const packaging = this.packagingInput();
    if (!packaging) return;

    // An emptied box saves the name's slug. A new product omits it, so the
    // server derives and de-duplicates it; omitted on an update it stays.
    const slug =
      this.slugSource() !== 'typed'
        ? this.isNew
          ? undefined
          : slugify(this.name()) || undefined
        : this.slug().trim() || undefined;
    const sourceId = this.sourceId().trim() || undefined;

    const body: ProductInput = {
      name: this.name().trim(),
      priceMinor,
      categoryId: this.categoryId(),
      descriptionHtml: this.description(),
      attributes: this.storedAttributes(),
      parts: this.parts(),
      images: this.images(),
      variants,
      // Whole sets: an absent tier loses its price, an absent pairing goes
      // from both products, an absent document from this one (FR-DOC-02).
      tierPrices,
      pairedSlugs: this.pairings().map((p) => p.slug),
      documentIds: this.documents().map((d) => d.id),
      featured: this.featured(),
      lineNoteEnabled: this.lineNoteEnabled(),
      lineNotePrompt: this.lineNoteEnabled()
        ? this.lineNotePrompt().trim() || null
        : null,
      stockPieces: this.parsedStockPieces(),
      // The contract refuses a threshold on untracked stock.
      lowStockThresholdPieces:
        this.parsedStockPieces() === null ? null : this.parsedThreshold(),
      taxRate,
      ...packaging,
      ...(slug ? { slug } : {}),
      ...(sourceId ? { sourceId } : {}),
    };

    // Clearing the price unpublishes, so it is asked as an unpublish is.
    const existingSlug = this.slugParam;
    if (
      existingSlug !== null &&
      this.priceCleared() &&
      this.published() &&
      !(await this.confirm.ask({
        heading: this.editText.unpublishConfirm.heading,
        message: await this.productsService.unpublishMessage(
          { slug: existingSlug, name: body.name },
          this.editText,
        ),
        confirmLabel: this.text.saveAndUnpublish,
        cancelLabel:
          this.editText.unpublishConfirm.cancel ?? this.actionText.cancel,
        confirmVariant: 'danger',
      }))
    ) {
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    try {
      const result =
        existingSlug === null
          ? await this.productsService.create(body)
          : await this.productsService.update(existingSlug, body);
      if (!result.ok) {
        this.error.set(this.refusalText(result.code, existingSlug === null));
        return;
      }
      let product = result.product;
      if (andPublish) {
        // The edits are saved by now, so a failure here is a failure to
        // publish, not to save.
        try {
          product = await this.productsService.setPublished(product.slug, true);
        } catch {
          this.error.set(this.text.publishError);
          return;
        }
      }
      this.unsaved.leave();
      await this.leaveTo(product);
    } catch {
      this.error.set(this.text.saveError);
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * An unpublished product has no storefront page, so the grid stands in,
   * searched for it (`searchTerm`: the grid binds inputs by parameter name).
   * A deleted one is listed only under its own state (FR-ADM-22).
   */
  private leaveTo(product: AdminProduct): Promise<boolean> {
    return product.publishedAt === null
      ? this.router.navigate(['/admin/products'], {
          queryParams: {
            searchTerm: product.name,
            state: product.deletedAt ? 'deleted' : null,
          },
        })
      : this.router.navigate(['/product', product.slug]);
  }

  protected cancel(): void {
    const existingSlug = this.slugParam;
    void this.close(
      existingSlug === null ? '/catalog' : `/product/${existingSlug}`,
    );
  }

  /** Ignores where the editor was opened from: the destination is the point. */
  protected cancelToPage(): void {
    const existingSlug = this.slugParam;
    if (existingSlug === null) return;
    void this.router.navigateByUrl(`/product/${existingSlug}`);
  }
}
