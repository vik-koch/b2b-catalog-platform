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
  isValidPartList,
  minimumFitsPacks,
  piecesPerUnit,
  PRODUCT_LINE_NOTE_PROMPT_MAX_LENGTH,
  ProductAttribute,
  DEFAULT_LOW_STOCK_THRESHOLD_PIECES,
  ProductAvailability,
  productAvailability,
  ProductDetail,
  lowStockThreshold,
  splitAttributeKey,
  totalMinor,
  moneyFormat,
} from '@b2b-catalog-platform/shared';
import {
  AdminCategory,
  AttributeDefinition,
  AttributeKeyUsage,
  CustomerTier,
  hasDistinctVariants,
  LinkedDocument,
  PairedProduct,
  ProductImageInput,
  ProductInput,
  ProductVariantInput,
  shownPictures,
  slugify,
} from '@b2b-catalog-platform/shared/admin';
import {
  currencySymbol,
  decimalSeparator,
  formatPriceInput,
  parsePriceInput,
} from '../../shared/catalog/price';
import { LockedNote } from '../ownership/locked-note';
import { StatusBadge } from '../../shared/ui/status-badge';
import { LockedFieldMarker } from '../ownership/locked-field-marker';
import { SettingsService } from '../settings/settings.service';
import { ProductAvailabilityBadge } from '../../shared/catalog/product-availability-badge';
import { ProductDetailView } from '../../shared/catalog/product-detail-view';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { delayedLoading } from '../../shared/core/delayed-loading';
import { filled } from '../../shared/core/field-rules';
import { usePageSeo } from '../../shared/core/page-seo';
import { UnsavedChangesAware } from '../unsaved-changes.guard';
import { Button } from '../../shared/ui/button';
import { Checkbox } from '../../shared/ui/checkbox';
import { ConfirmService } from '../../shared/ui/confirm.service';
import { FieldAttempt, FIELD_ATTEMPT } from '../../shared/ui/field-attempt';
import { FieldLabel } from '../../shared/ui/field-label';
import { FORM_FIELDS } from '../../shared/ui/form-fields';
import { submitAttempt } from '../../shared/ui/submit-attempt';
import { AdminIcon } from '../../shared/ui/icons/admin-icon';
import { PRODUCT_FEATURE_GLYPHS } from './product-feature-glyphs';
import { Input } from '../../shared/ui/input';
import { NumericField } from '../../shared/ui/numeric-field';
import { PercentField } from '../../shared/ui/percent-field';
import { PriceField } from '../../shared/ui/price-field';
import { Skeleton } from '../../shared/ui/skeleton';
import { AdminCatalogService } from '../admin-catalog.service';
import { AttributesService } from '../attributes/attributes.service';
import { CategoryPicker } from '../categories/category-picker';
import { categoryAncestors } from '../categories/category-tree';
import { injectEditorReturn } from '../../shared/edit-mode/editor-return';
import { RichTextEditor } from '../rich-text/rich-text-editor';
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
import {
  UNIT_FIELD_INPUT,
  UNIT_FIELD_INPUT_COMPACT,
  UnitField,
} from '../../shared/ui/unit-field';
import { PageTitle } from '../../shared/ui/page-title';
import { ErrorText } from '../../shared/ui/error-text';

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
 * Add/Edit a product (FR-ADM-01). One screen for both: `/admin/products/new`
 * and `/admin/products/:slug/edit`. Mirrors the static-page editor's shape —
 * dirty tracking (via a route guard), a live preview, and a stable slug that is
 * derived from the name but overridable. Browser-only (an admin route).
 */
@Component({
  selector: 'app-product-editor-page',
  imports: [
    FORM_FIELDS,
    LockedNote,
    Button,
    AdminIcon,
    RichTextEditor,
    NumericField,
    PercentField,
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
    FieldLabel,
    Input,
    PriceField,
    Skeleton,
    UnitField,
    LockedFieldMarker,
    StatusBadge,
    PageTitle,
    ErrorText,
  ],
  // No <form> element: the buttons under the page save, publish or preview,
  // so the page says itself when the form has been sent.
  providers: [
    {
      provide: FIELD_ATTEMPT,
      useExisting: forwardRef(() => ProductEditorPage),
    },
  ],
  template: `
    <div class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <h1 appPageTitle>
        {{ isNew ? text.newTitle : text.editTitle }}
      </h1>
      <!-- Where the product stands, beside its name — the same badges the
           hidden-products overlay puts on a tile. Deleted alone where it
           applies: restoring is the only step back from there (FR-ADM-01).
           The price one tracks the field rather than what is stored: it says
           what the product will be after a save, which is the question
           somebody editing it is actually asking. -->
      @if (!isNew && !loading() && !notFound()) {
        @if (deleted()) {
          <span appStatusBadge tone="danger">{{ productStates.deleted }}</span>
        } @else {
          @if (!published()) {
            <span appStatusBadge tone="waiting">{{
              productStates.unpublished
            }}</span>
          }
          @if (priceCleared()) {
            <span appStatusBadge tone="danger">{{
              productStates.unpriced
            }}</span>
          }
        }
      }
    </div>

    @if (loading()) {
      @if (showSkeleton()) {
        <app-skeleton [lines]="4" />
      }
    } @else if (notFound()) {
      <p class="text-ink-subtle" role="alert">{{ text.saveError }}</p>
    } @else if (newAndOwned()) {
      <!-- Creating writes every owned field at once, identity included, so
           there is nothing here to offer. The affordances that lead here are
           deliberately left in place — this is the one screen that can explain
           why, and both of them (the list's button and the storefront's "add
           product here") land on this route. -->
      <app-locked-note>{{ ownershipText.productCreate }}</app-locked-note>
    } @else if (previewing()) {
      <p
        class="mb-6 rounded-md bg-surface px-4 py-2 text-sm text-ink-subtle"
        role="status"
      >
        {{ text.previewNotice }}
      </p>
      <app-product-detail-view [item]="previewItem()" [canAdd]="false" />
    } @else {
      <div class="max-w-3xl space-y-6">
        <!-- Said once, at the top, where it explains every lock below it. The
             per-field marks say which fields; this says why and where to
             change it. -->
        @if (catalogOwned()) {
          <app-locked-note>{{ ownershipText.fieldLocked }}</app-locked-note>
        }

        <app-field
          [field]="form.name"
          [label]="text.name"
          controlId="product-name"
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

        <!-- Side by side from sm up: the price is a short field and the
             category picker is the long one beside it. Below that each takes a
             line of its own — a 10rem price field and a picker sharing 360px
             are two fields too narrow to read.

             A grid rather than a flex row so the note under the price can be a
             row of its own: inside the price field's own column it grew that
             column and pushed the category picker away from the field it
             belongs to. The picker is placed explicitly, so the note can sit
             between the two fields in the markup and read under the price on a
             phone. -->
        <div
          class="grid gap-6 sm:grid-cols-[10.875rem_4.6875rem_minmax(0,1fr)]"
        >
          <!-- Named after the list it writes: it is one price list's row like
               any other below, and the only thing separating it is that the
               storefront quotes it. -->
          <app-field
            class="w-full sm:w-auto"
            [field]="form.price"
            [label]="priceLabel()"
            controlId="product-price"
          >
            <app-locked-field-marker appFieldCaption [field]="form.price" />
            <!-- Text, not type=number: a number input reports a half-typed
                 "18." as an empty value, so binding the signal back to it wiped
                 the field the moment a decimal separator was pressed. The
                 inputmode still gets the numeric keypad on touch. -->
            <app-unit-field class="w-full sm:w-43.5" [unit]="currencySuffix">
              <input
                type="text"
                inputmode="decimal"
                appPriceField
                [class]="unitFieldInput"
                [placeholder]="pricePlaceholder"
                [formField]="form.price"
                (blur)="onPriceBlur()"
              />
            </app-unit-field>
          </app-field>

          <!-- The product's own tax rate, beside the price it qualifies and
               owned like it. Half the price field less half a gap, which
               holds "12.75"; empty is the deployment's default, which the
               placeholder shows. Its own line on a phone, like the price. -->
          <app-field
            class="w-full"
            [field]="form.taxRate"
            [label]="text.taxRate.label"
            controlId="product-tax-rate"
          >
            <app-locked-field-marker appFieldCaption [field]="form.taxRate" />
            <app-unit-field class="w-full" unit="%" [compact]="true">
              <input
                type="text"
                appPercentField
                [class]="unitFieldInputCompact"
                [placeholder]="taxRatePlaceholder"
                [formField]="form.taxRate"
              />
            </app-unit-field>
          </app-field>

          <!-- Said where the fields are, not only on the button: by the time
               somebody reads the button they have already cleared the price.
               Under the fields on a phone, where they are a column; across all
               three columns from sm up, so appearing mid-edit moves nothing
               beside them. One row for both notes, so neither leaves a gap
               when only the other is shown. -->
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

          <app-field
            class="w-full sm:col-start-3 sm:row-start-1 sm:w-auto"
            [field]="form.categoryId"
            [label]="text.category"
            controlId="product-category"
          >
            <app-locked-field-marker
              appFieldCaption
              [field]="form.categoryId"
            />
            <app-category-picker
              [categories]="categories()"
              [field]="form.categoryId"
              [placeholder]="text.categoryPlaceholder"
            />
          </app-field>
        </div>

        <!-- Only where the deployment actually has tiers: with none, the base
             price is the whole pricing story and an empty section would only
             raise a question the admin cannot act on. -->
        @if (otherTiers().length > 0) {
          <div>
            <app-product-tier-prices-editor
              [tiers]="otherTiers()"
              [basePrice]="basePriceText()"
              [field]="form.tierPrices"
            />
          </div>
        }

        <!-- The product's two identifiers, side by side: the one the shop
             addresses it by and the one the source system knows it as. They
             are read and corrected together, and neither is worth a full line
             of a 48rem form. One per line below sm, like every other pair on
             this page. -->
        <div class="grid gap-6 sm:grid-cols-2">
          <app-field
            [field]="form.slug"
            [label]="text.slug"
            [hint]="text.slugHint"
            controlId="product-slug"
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
            controlId="product-source-id"
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
          <span appFieldLabel>{{ product.description }}</span>
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
          <legend appFieldLabel>{{ text.stock.heading }}</legend>
          @if (!catalogOwned()) {
            <p class="mb-2 text-xs text-ink-subtle">{{ text.stock.hint }}</p>
          }
          <!-- Both counts in pieces, said in the fields rather than under
               them: the two are one sentence about how much is left, and a
               hint apiece made the block four lines deep for two numbers. -->
          <div class="grid gap-4 sm:grid-cols-2">
            <app-field
              [field]="form.stockPieces"
              [label]="text.stock.pieces"
              controlId="product-stock"
            >
              <app-locked-field-marker
                appFieldCaption
                [field]="form.stockPieces"
              />
              <app-unit-field class="w-full" [unit]="pieceSuffix">
                <input
                  type="text"
                  appNumericField="signed"
                  [class]="unitFieldInput"
                  [formField]="form.stockPieces"
                />
              </app-unit-field>
            </app-field>
            <!-- The figure in force as the placeholder: empty means "work it
                 out from the packaging", and the number that would be worked
                 out is what an empty field then shows. It follows the
                 packaging as it is edited, and there is nothing to show while
                 the stock is untracked — the field is disabled then, and a
                 greyed figure in a greyed field reads as a value. -->
            <app-field
              [field]="form.lowStockThreshold"
              [label]="text.stock.threshold"
              controlId="product-threshold"
            >
              <app-unit-field class="w-full" [unit]="pieceSuffix">
                <input
                  type="text"
                  appNumericField="integer"
                  [class]="unitFieldInput"
                  [placeholder]="thresholdPlaceholder()"
                  [formField]="form.lowStockThreshold"
                />
              </app-unit-field>
            </app-field>
          </div>
          <!-- The badge itself rather than its name: what the admin is
               choosing is what a customer will see, and the preview panel is
               too far down the page to answer that while typing. As tall as
               the pill either way — 22px, the badge's own height — so entering
               a figure does not nudge the line down as the pill appears. -->
          <p
            class="mt-3 flex min-h-5.5 items-center gap-2 text-xs text-ink-subtle"
          >
            <span>{{ text.stock.preview }}</span>
            @if (previewAvailability(); as state) {
              <app-product-availability-badge [availability]="state" />
            } @else {
              <span>{{ text.stock.untracked }}</span>
            }
          </p>
        </fieldset>

        <!-- The optional extras, one box each and in the order the grid
             draws their glyphs: open where the product uses one, shut where
             it does not. All six are the shop's own, open while the catalog
             is owned and never written by a run. -->
        <app-feature-disclosure
          [label]="text.featured.heading"
          [glyph]="glyphs.featured"
          [on]="featured()"
        >
          <p class="mb-2 text-xs text-ink-subtle">{{ text.featured.hint }}</p>
          <label class="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              appCheckbox
              class="mt-0.5"
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

        <!-- Its own box, though the first variant switches it on: the note is
             how a customer picks among variants, and it stands without them
             too. -->
        <app-feature-disclosure
          [label]="text.lineNote.heading"
          [glyph]="glyphs.note"
          [on]="lineNoteEnabled()"
        >
          <p class="mb-2 text-xs text-ink-subtle">{{ text.lineNote.hint }}</p>
          <label class="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              appCheckbox
              class="mt-0.5"
              [checked]="lineNoteEnabled()"
              (change)="onLineNoteToggle($any($event.target).checked)"
            />
            <span>{{ text.lineNote.enable }}</span>
          </label>
          @if (lineNoteEnabled()) {
            <app-field
              class="mt-3"
              [field]="form.lineNotePrompt"
              [label]="text.lineNote.prompt"
              [hint]="text.lineNote.promptHint"
              controlId="product-line-note-prompt"
            >
              <input
                type="text"
                appInput
                class="w-full"
                [placeholder]="text.lineNote.promptPlaceholder"
                [formField]="form.lineNotePrompt"
              />
            </app-field>
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
      <p appErrorText class="mt-4" role="alert">{{ error() }}</p>
    }

    @if (!loading() && !notFound()) {
      <div class="mt-6 flex max-w-3xl flex-wrap gap-3">
        <!-- Nothing to save on the "new" route while the catalog is externally
             owned: what stands above is an explanation, not a form, and a Save
             button over it could only fail. Cancel stays, so there is a way
             out. -->
        @if (!newAndOwned()) {
          <button
            appButton
            type="button"
            class="gap-2"
            [disabled]="saving()"
            (click)="save()"
          >
            <app-admin-icon name="save" class="size-4" />
            {{ saving() ? actionText.saving : saveLabel() }}
          </button>
        }
        <!-- Only while the product is off the storefront: publishing is one
             click from the list once it is on. -->
        <!-- Not offered without a price: the server refuses to publish one,
             and a button whose only outcome is that refusal is a worse way of
             saying so than not offering it. The refusal still stands behind
             it — this is the screen agreeing with the rule, not enforcing it. -->
        <!-- Nor on a deleted product, which is restored before it is
             published (FR-ADM-01). -->
        @if (!published() && !deleted() && !newAndOwned() && !priceCleared()) {
          <button
            appButton
            variant="secondary"
            type="button"
            class="gap-2"
            [disabled]="saving()"
            (click)="save(true)"
          >
            <app-admin-icon name="circle-check" class="size-4" />
            {{ text.saveAndPublish }}
          </button>
        }
        @if (!newAndOwned()) {
          <button
            appButton
            variant="secondary"
            type="button"
            class="gap-2"
            (click)="previewing.set(!previewing())"
          >
            <app-admin-icon
              [name]="previewing() ? 'pencil' : 'eye'"
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
          appButton
          variant="secondary"
          type="button"
          class="gap-2"
          (click)="cancel()"
        >
          <app-admin-icon name="x" class="size-4" />
          {{ actionText.cancel }}
        </button>
        <!-- Cancel puts the admin back where they came from, which for an
             editor opened from the admin list is the admin list — so seeing
             the product as a customer sees it meant saving first. This exit
             discards the same way and lands on the page itself, which an
             admin is shown whether or not it is on the storefront
             (FR-ADM-06). -->
        @if (!isNew) {
          <button
            appButton
            variant="secondary"
            type="button"
            class="gap-2"
            (click)="cancelToPage()"
          >
            <app-admin-icon name="eye" class="size-4" />
            {{ text.cancelToPage }}
          </button>
        }
      </div>
    }
  `,
})
export class ProductEditorPage implements UnsavedChangesAware, FieldAttempt {
  private readonly service = inject(AdminCatalogService);
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
  /** The grid's glyphs, on the sections that set what they stand for. */
  protected readonly glyphs = PRODUCT_FEATURE_GLYPHS;
  protected readonly ownershipText = inject(ADMIN_TEXT).ownership;
  /** The badge wording, shared with the storefront's hidden-products overlay. */
  protected readonly editText = inject(ADMIN_TEXT).editMode;
  protected readonly product = inject(SHARED_TEXT).product;
  protected readonly productStates = inject(ADMIN_TEXT).products;
  private readonly ownership = inject(SettingsService);

  /**
   * Whether the exchange holds the catalog's fields (FR-ADM-10). Null while
   * the answer is still in flight, and that reads as *not* owned here: the
   * load is kicked off in the constructor and resolves well before anyone has
   * typed, and painting every field locked on the way in would be a worse
   * flicker than the one it avoids. Nothing is decided by this — the API
   * refuses the save either way.
   */
  protected readonly catalogOwned = computed(
    () => this.ownership.ownedAreas()?.includes('catalog') ?? false,
  );

  /** The "new" route with nothing to create on it. */
  protected readonly newAndOwned = computed(
    () => this.isNew && this.catalogOwned(),
  );
  /** The piece abbreviation, printed inside both stock fields — the same one
   * the packaging rows use, so the two blocks measure in one word. */
  protected readonly pieceSuffix = inject(SHARED_TEXT).units.piece;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly unitFieldInput = UNIT_FIELD_INPUT;
  protected readonly unitFieldInputCompact = UNIT_FIELD_INPUT_COMPACT;

  /** null slug param → the "new" route. */
  private readonly slugParam = this.route.snapshot.paramMap.get('slug');
  protected readonly isNew = this.slugParam === null;

  protected readonly loading = signal(true);
  protected readonly showSkeleton = delayedLoading(this.loading);
  protected readonly notFound = signal(false);
  protected readonly categories = signal<AdminCategory[]>([]);
  protected readonly tiers = signal<CustomerTier[]>([]);
  protected readonly attributeKeys = signal<AttributeKeyUsage[]>([]);
  protected readonly attributeDefinitions = signal<AttributeDefinition[]>([]);
  /**
   * The keys the stored product carries, so the grid's badges can discount it
   * from the catalog's counts and keep speaking about the other products.
   */
  protected readonly ownAttributeKeys = signal<string[]>([]);

  /** Where the slug comes from. A new record follows its name from the start.
   * An emptied box stays empty until the name is next edited, then follows
   * it, so clearing the box does not refill it from the current name. */
  private readonly slugSource = signal<'typed' | 'emptied' | 'name'>(
    this.isNew ? 'name' : 'typed',
  );
  protected readonly description = signal('');
  protected readonly attributes = signal<ProductAttribute[]>([]);
  protected readonly images = signal<ProductImageInput[]>([]);
  protected readonly pairings = signal<PairedProduct[]>([]);
  protected readonly documents = signal<LinkedDocument[]>([]);
  /** Offered first to the main page's row (FR-CAT-09). */
  protected readonly featured = signal(false);
  protected readonly lineNoteEnabled = signal(false);

  /** What can be wrong, and so what the form checks. */
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
      // Only the fields an exchange writes; the rest stay the shop's own. The
      // reason is what each field's lock says.
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
            message: this.text.tierPrices.invalid.replace(
              '{tier}',
              tier?.label ?? '',
            ),
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
  /** Kept as strings like the packaging drafts, so a half-typed or
   * deliberately blank figure is not thrown away between keystrokes. */
  protected readonly stockPieces = computed(() => this.model().stockPieces);
  protected readonly lowStockThresholdInput = computed(
    () => this.model().lowStockThreshold,
  );
  protected readonly lineNotePrompt = computed(
    () => this.model().lineNotePrompt,
  );
  protected readonly tierPrices = computed(() => this.model().tierPrices);
  protected readonly packaging = computed(() => this.model().packaging);
  /** What one piece is made of, where it is sold as a set (FR-CAT-10). */
  protected readonly parts = computed(() => this.model().parts);
  protected readonly partsValid = computed(() => isValidPartList(this.parts()));
  protected readonly variants = computed(() => this.model().variants);

  /** The packaging rule's message, once a save has asked for it: the editor
   * corrects most of what it catches as a field is left. */
  protected readonly packagingError = computed(() =>
    submitAttempt(this.form)()
      ? (this.form.packaging().errors()[0]?.message ?? null)
      : null,
  );
  /** The default rate, shown in the empty field. */
  protected readonly taxRatePlaceholder =
    this.tax.basis === 'none' ? '' : formatTaxRate(this.tax.rate, this.locale);
  /** Under a basis that charges no tax a rate is kept but applies to
   * nothing yet, which the field alone would not say. */
  protected readonly taxRateNotInEffect = this.tax.basis === 'none';

  /** Null until loaded; drives the publish switch and where a save returns to. */
  protected readonly published = signal(false);
  /** Soft-deleted: still editable, and the badge beside the title says so. */
  protected readonly deleted = signal(false);
  protected readonly previewing = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  // JSON snapshot of the form at load, for dirty detection.
  private original = '';
  private navigatingAway = false;
  private readonly close = injectEditorReturn();

  /** Read by every field on the page (FIELD_ATTEMPT). */
  readonly attempted = computed(() => submitAttempt(this.form)());
  private readonly partsEditor = viewChild(ProductPartsEditor);
  private readonly variantsEditor = viewChild(ProductVariantsEditor);
  private readonly injector = inject(Injector);

  /** Shows the shape a price takes here, e.g. "0,00" in a de-DE deployment. */
  protected readonly pricePlaceholder = `0${decimalSeparator(this.currency)}00`;
  /** The mark the deployment's prices are written with, printed inside every
   * price field on this page — the base one here and the tier fields below. */
  protected readonly currencySuffix = currencySymbol(this.currency);

  /**
   * The base price as the tier fields advertise it — what an emptied tier
   * charges. Formatted, not the raw text, so a half-typed "18," still shows the
   * "18,00" it would save as; empty while the field holds no price at all.
   */
  protected readonly basePriceText = computed(() => {
    // Nothing to advertise while the field holds no price — a zero included,
    // which saves as none: the tier fields fall back to naming it instead.
    if (this.priceCleared()) return '';
    const minor = parsePriceInput(this.priceInput(), this.currency);
    return minor === null ? '' : formatPriceInput(minor, this.currency);
  });

  /** The storefront's price list, under its own name. */
  private readonly defaultTier = computed(() =>
    this.tiers().find((t) => t.isDefault),
  );

  protected readonly priceLabel = computed(() =>
    fillText(this.text.priceWithList, {
      list: this.defaultTier()?.label ?? '',
    }),
  );

  /** The other lists — this product's price in the storefront's list is the
   * field above, not a row in the table below. */
  protected readonly otherTiers = computed(() =>
    this.tiers().filter((t) => !t.isDefault),
  );

  /**
   * The field says this product has no price, which is a state the catalog
   * holds: it simply cannot be on the storefront.
   *
   * Zero is that state too, and stored as one rather than as a row saying the
   * product is free: a shop that gives something away does not price it at
   * nothing, and two spellings of one state is what the null is here to
   * avoid. Typing 0,00 therefore reads exactly as clearing the field, warning
   * and save label included.
   */
  protected readonly priceCleared = computed(() => {
    const text = this.priceInput().trim();
    return text === '' || parsePriceInput(text, this.currency) === 0;
  });

  /** Says what the save will do before it is pressed: clearing the price of a
   * published product takes it off the storefront in the same write. */
  protected readonly saveLabel = computed(() =>
    this.priceCleared() && this.published()
      ? this.text.saveAndUnpublish
      : this.adminText.actions.save,
  );

  /**
   * Empties a price field left at zero. A price of nothing is no price, and an
   * empty field is how this form says that — so the field is put into that
   * state as soon as it is left, rather than reading as a free product until
   * the save silently turns it into none.
   */
  protected onPriceBlur(): void {
    if (parsePriceInput(this.priceInput(), this.currency) === 0) {
      this.form.price().value.set('');
    }
  }

  /** The declared unit for an attribute key, matched as the server matches it:
   * exactly, apart from surrounding whitespace (FR-ATTR-02), and without the
   * part a set's row names (FR-CAT-10). */
  private unitFor(key: string): string | null {
    const name = splitAttributeKey(key, this.parts()).key;
    return (
      this.attributeDefinitions().find((d) => d.name === name)?.unit ?? null
    );
  }

  /**
   * Pieces on hand, or null for a blank field — which means the stock is not
   * tracked, not that it is zero. Negative is allowed: a stocktake correction
   * reads as out of stock rather than being refused.
   */
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

  /** What the badge would say if the form were saved as it stands — the same
   * function the API applies, so the preview cannot disagree with the save. */
  protected readonly previewAvailability = computed<ProductAvailability | null>(
    () =>
      productAvailability(
        this.parsedStockPieces(),
        this.packagingInput() ?? { piecesPerPack: null, packsPerBox: null },
        this.parsedThreshold(),
        this.lowStockFallback,
      ),
  );

  /** Names the figure actually in force, so an admin can see what the ladder
   * resolved to without working the packaging out in their head. */
  /** The threshold that is actually in force, shown where the field is empty.
   * Nothing while the stock is untracked: the field is disabled then, and a
   * figure in it would read as a value rather than as a default. */
  protected readonly thresholdPlaceholder = computed(() =>
    this.parsedStockPieces() === null
      ? ''
      : String(
          lowStockThreshold(
            this.packagingInput() ?? { piecesPerPack: null, packsPerBox: null },
            this.parsedThreshold(),
            this.lowStockFallback,
          ),
        ),
  );

  protected readonly previewPriceMinor = computed(
    () => parsePriceInput(this.priceInput(), this.currency) ?? 0,
  );

  /** Null where the packaging hints have no price to multiply: the editor says
   * so rather than quoting a pack at zero. */
  protected readonly packagingPriceMinor = computed(() =>
    this.priceCleared()
      ? null
      : parsePriceInput(this.priceInput(), this.currency),
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
      // What the storefront will show: unavailable variants' pictures
      // withheld, the rest labelled (FR-CAT-11/12).
      images: shownPictures(this.images(), this.variants()),
      variants: this.variants().map(({ name, unavailable }) => ({
        name: name.trim(),
        unavailable,
      })),
      lineNoteEnabled: this.lineNoteEnabled(),
      lineNotePrompt: this.lineNotePrompt().trim() || null,
      availability: this.previewAvailability(),
      taxRate: effectiveTaxRate(this.tax, this.parsedTaxRate() ?? null),
      // What the marker will say once this is saved, counted the way the
      // storefront counts it: a counterpart that is withdrawn or unpublished
      // keeps its row in the box above and is not a product on offer.
      pairedCount: this.pairings().filter(
        (paired) => !paired.deleted && !paired.unpublished,
      ).length,
      // Only a list that would save: a half-typed one would draw a marker the
      // storefront will never show.
      parts: this.partsValid() ? this.parts() : [],
      // The preview lists no documents: what this form holds is a set of
      // links, not the files behind them, and the section is drawn from the
      // stored file's URL and size. It appears on the saved page.
      documents: [],
      // The unit is the registry's, not the row's — the preview joins it on
      // exactly as the storefront's read does, so a declared attribute reads
      // the same here as on the live page.
      attributes: this.attributes()
        .filter((a) => a.key.trim() !== '' || a.value.trim() !== '')
        // No filter link in the preview: it would leave the half-saved
        // product for a listing built from what is already stored.
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

  private readonly dirty = computed(() => this.snapshot() !== this.original);

  constructor() {
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
    const [categories, tiers, attributeKeys, definitions] = await Promise.all([
      this.service.listCategories(),
      // The tier list is small and admin-only, like the categories above; both
      // are needed before the form can render its pickers.
      this.tiersService.list().then((r) => r.tiers),
      // The attribute hints are a convenience beside the grid, not part of the
      // product: a failure here costs the picker and the row indicators, and
      // must not cost the editor.
      this.attributesService.listKeys().catch(() => []),
      this.attributesService.list().catch(() => []),
      // Awaited with the rest so the form is never painted before the answer:
      // on the "new" route the whole screen turns on it, and a form that
      // flashes and is then replaced reads as a bug.
      this.ownership.load(),
    ]);
    this.categories.set(categories);
    this.tiers.set(tiers);
    this.attributeKeys.set(attributeKeys);
    this.attributeDefinitions.set(definitions);
    const existingSlug = this.slugParam;
    if (existingSlug !== null) {
      const product = await this.service.getProduct(existingSlug);
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
          // Shown with the deployment's own decimal separator, like a price:
          // the column holds "0.072" whatever the locale, and a form that
          // prints 18,90 beside 0.072 looks like two different products' data.
          boxVolume: this.showDecimal(product.boxVolume),
          boxWeight: this.showDecimal(product.boxWeight),
          // A box ships as one unless told otherwise, and the rule is shown
          // the way the minimum is. Without a box there is nothing to count,
          // and the field is disabled and empty.
          boxCount:
            product.packsPerBox === null ? '' : product.boxCount.toString(),
        },
        parts: product.parts,
        variants: product.variants,
      });
    } else {
      // "Add product in this category" preselects it (by slug) — set before the
      // snapshot so the default doesn't count as an unsaved change.
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
    this.original = this.snapshot();
    this.loading.set(false);
  }

  /**
   * What a save sends. A row with no value states nothing — the picker adds one
   * per name picked, and the ones left unfilled are simply not saved; the server
   * applies the same rule, so what comes back matches what was sent.
   */
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

  /**
   * The packaging fields as the contract wants them, or null if a field holds
   * something that is not a whole number. Blank means "not sold in that unit",
   * and for the minimum it means 1.
   */
  /** A stored `numeric` string as the form shows it — the separator swapped for
   * the deployment's, and nothing else touched, so the digits an admin typed
   * survive a round trip unchanged. */
  private showDecimal(stored: string | null): string {
    return stored === null
      ? ''
      : stored.replace('.', decimalSeparator(this.currency));
  }

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
      // A box without a pack is meaningless, and the server refuses it.
      packsPerBox: piecesPerPack === null ? null : packsPerBox,
      minPieceQty,
      // Dimensions belong to a box; without one they would never be shown.
      // Either separator is accepted while typing, like a price.
      boxVolume: packsPerBox === null ? null : decimal(draft.boxVolume),
      boxWeight: packsPerBox === null ? null : decimal(draft.boxWeight),
      // A count of boxes needs a box, exactly as the dimensions do.
      boxCount: packsPerBox === null ? 1 : boxCount,
    };
  }

  /**
   * A deleted variant's pictures stay in the gallery, showing none — deleting a
   * name never deletes an upload (FR-CAT-12).
   */
  protected setVariants(next: ProductVariantInput[]): void {
    const ids = new Set(next.map((variant) => variant.id));
    // The first variant switches the note on: naming colours is nearly always
    // so a customer can ask for one. Only a suggestion — it can be switched
    // off again for goods sold assorted only.
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

  /** Turning the note off drops the prompt with it — that is what a save
   * stores, and leaving the text behind would show the form as unsaved. */
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

  /**
   * Shows the first thing that stopped a save: back from the preview, the
   * field focused, or the list's box opened where the list is the culprit.
   */
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

  protected async save(andPublish = false): Promise<void> {
    submitAttempt(this.form).set(true);
    if (this.form().invalid()) return this.revealFirstError();

    const priceMinor = this.priceCleared()
      ? null
      : parsePriceInput(this.priceInput(), this.currency);
    const tierPrices = [];
    for (const draft of this.tierPrices()) {
      const tierMinor = parsePriceInput(draft.value, this.currency);
      // An empty field uses the base price, and so does a zero: the list keeps
      // no price of its own and is charged the storefront's.
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

    // An emptied box saves the name's slug, as a following one does. For a
    // new product it is omitted, so the server derives and de-duplicates it;
    // an existing one sends it, because omitting it there keeps the stored one.
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
      // Half-filled rows are dropped: a value with no name is meaningless, and
      // a name with no value states nothing.
      attributes: this.storedAttributes(),
      parts: this.parts(),
      images: this.images(),
      variants,
      // The full set: a tier the admin cleared is absent here, and the server
      // takes that as "remove the override".
      tierPrices,
      // The whole set, from this product's side: a counterpart removed here is
      // removed from that product too, because one pairing is one row.
      pairedSlugs: this.pairings().map((p) => p.slug),
      // The whole set from this product's side too, and only this side: the
      // document keeps every other product it is shown on (FR-DOC-02).
      documentIds: this.documents().map((d) => d.id),
      featured: this.featured(),
      lineNoteEnabled: this.lineNoteEnabled(),
      // A prompt is only meaningful with the note on; the server refuses the
      // pair the other way round.
      lineNotePrompt: this.lineNoteEnabled()
        ? this.lineNotePrompt().trim() || null
        : null,
      stockPieces: this.parsedStockPieces(),
      // A threshold with nothing to measure would be refused by the contract;
      // clearing the stock clears it here rather than in a message.
      lowStockThresholdPieces:
        this.parsedStockPieces() === null ? null : this.parsedThreshold(),
      taxRate,
      ...packaging,
      ...(slug ? { slug } : {}),
      ...(sourceId ? { sourceId } : {}),
    };

    // Clearing the price takes the product off sale in the same write, so it
    // is asked as an unpublish is, with the same wording.
    const existingSlug = this.slugParam;
    if (
      existingSlug !== null &&
      this.priceCleared() &&
      this.published() &&
      !(await this.confirm.ask({
        heading: this.editText.unpublishConfirm.heading,
        message: await this.service.unpublishMessage(
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
    const result =
      existingSlug === null
        ? await this.service.createProduct(body)
        : await this.service.updateProduct(existingSlug, body);

    if (!result.ok) {
      this.error.set(this.adminText.catalogErrors[result.code]);
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
      // A deleted product is only listed under its own state (FR-ADM-22).
      await this.router.navigate(['/admin/products'], {
        queryParams: {
          searchTerm: product.name,
          state: product.deletedAt ? 'deleted' : null,
        },
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

  /** The same discard, ignoring where the editor was opened from: the point of
   * this one is the destination. Guarded by the same canDeactivate. */
  protected cancelToPage(): void {
    const existingSlug = this.slugParam;
    if (existingSlug === null) return;
    void this.router.navigateByUrl(`/product/${existingSlug}`);
  }
}
