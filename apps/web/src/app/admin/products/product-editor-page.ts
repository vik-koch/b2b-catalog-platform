import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AdminCategory,
  AttributeDefinition,
  AttributeKeyUsage,
  CatalogImage,
  CustomerTier,
  fillText,
  minimumFitsPacks,
  piecesPerUnit,
  PRODUCT_LINE_NOTE_PROMPT_MAX_LENGTH,
  ProductAttribute,
  DEFAULT_LOW_STOCK_THRESHOLD_PIECES,
  ProductAvailability,
  productAvailability,
  LinkedDocument,
  PairedProduct,
  ProductDetail,
  ProductInput,
  lowStockThreshold,
  slugify,
  totalMinor,
} from '@b2b-catalog-platform/shared';
import {
  currencySymbol,
  decimalSeparator,
  formatPriceInput,
  parsePriceInput,
} from '../../catalog/price';
import { StatusBadge } from '../../ui/status-badge';
import { LockedFieldMarker } from '../ownership/locked-field-marker';
import { SettingsService } from '../settings/settings.service';
import { ProductAvailabilityBadge } from '../../catalog/product-availability-badge';
import { ProductDetailView } from '../../catalog/product-detail-view';
import { ADMIN_TEXT } from '../../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { delayedLoading } from '../../core/delayed-loading';
import { usePageSeo } from '../../core/page-seo';
import { UnsavedChangesAware } from '../unsaved-changes.guard';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { FieldLabel } from '../../ui/field-label';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Input } from '../../ui/input';
import { NumericField } from '../../ui/numeric-field';
import { PriceField } from '../../ui/price-field';
import { Skeleton } from '../../ui/skeleton';
import { AdminCatalogService } from '../admin-catalog.service';
import { AttributesService } from '../attributes/attributes.service';
import { CategoryPicker } from '../categories/category-picker';
import { categoryAncestors } from '../categories/category-tree';
import { injectEditorReturn } from '../editor-return';
import { RichTextEditor } from '../rich-text/rich-text-editor';
import { TiersService } from '../tiers/tiers.service';
import { ProductAttributesEditor } from './product-attributes-editor';
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
import { UNIT_FIELD_INPUT, UnitField } from '../../ui/unit-field';

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
    NumericField,
    ProductAvailabilityBadge,
    CategoryPicker,
    ProductAttributesEditor,
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
  ],
  template: `
    <div class="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
      <h1 class="text-3xl font-medium tracking-tight">
        {{ isNew ? text.newTitle : text.editTitle }}
      </h1>
      <!-- Where the product stands, beside its name — the same three badges
           the hidden-products overlay puts on a tile, in the one place all
           three can be changed. The price one tracks the field rather than
           what is stored: it says what the product will be after a save, which
           is the question somebody editing it is actually asking. -->
      @if (!isNew && !loading() && !notFound()) {
        @if (deleted()) {
          <span appStatusBadge tone="danger">{{ editText.deletedBadge }}</span>
        }
        @if (!published()) {
          <span appStatusBadge tone="waiting">{{
            editText.unpublishedBadge
          }}</span>
        }
        @if (priceCleared()) {
          <span appStatusBadge tone="danger">{{ editText.unpricedBadge }}</span>
        }
      }
    </div>

    @if (loading()) {
      @if (showSkeleton()) {
        <app-skeleton [lines]="4" />
      }
    } @else if (notFound()) {
      <p class="text-muted" role="alert">{{ text.saveError }}</p>
    } @else if (newAndOwned()) {
      <!-- Creating writes every owned field at once, identity included, so
           there is nothing here to offer. The affordances that lead here are
           deliberately left in place — this is the one screen that can explain
           why, and both of them (the list's button and the storefront's "add
           product here") land on this route. -->
      <p
        class="max-w-3xl rounded-md border border-border bg-stone-100 px-4 py-3 text-sm text-muted"
        role="status"
      >
        {{ ownershipText.productCreate }}
      </p>
    } @else if (previewing()) {
      <p
        class="mb-6 rounded-md bg-stone-100 px-4 py-2 text-sm text-muted"
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
          <p
            class="rounded-md border border-border bg-stone-100 px-4 py-3 text-sm text-muted"
            role="status"
          >
            {{ ownershipText.fieldLocked }}
          </p>
        }

        <label class="block">
          <span appFieldLabel>
            {{ text.name }}
            <span class="text-accent" aria-hidden="true">*</span>
            @if (catalogOwned()) {
              <app-locked-field-marker />
            }
          </span>
          <input
            type="text"
            appInput
            class="w-full"
            [value]="name()"
            [disabled]="catalogOwned()"
            (input)="name.set($any($event.target).value)"
          />
        </label>

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
        <div class="grid gap-x-6 gap-y-6 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <label class="block w-full sm:w-auto">
            <!-- Named after the list it writes: it is one price list's row like
                 any other below, and the only thing separating it is that the
                 storefront quotes it. -->
            <span appFieldLabel>
              {{ priceLabel() }}
              @if (catalogOwned()) {
                <app-locked-field-marker />
              }
            </span>
            <!-- Text, not type=number: a number input reports a half-typed
                 "18." as an empty value, so binding the signal back to it wiped
                 the field the moment a decimal separator was pressed. The
                 inputmode still gets the numeric keypad on touch. -->
            <app-unit-field class="w-full sm:w-40" [unit]="currencySuffix">
              <input
                type="text"
                inputmode="decimal"
                appPriceField
                [class]="unitFieldInput"
                [value]="priceInput()"
                [placeholder]="pricePlaceholder"
                [disabled]="catalogOwned()"
                (input)="priceInput.set($any($event.target).value)"
                (blur)="onPriceBlur()"
              />
            </app-unit-field>
          </label>

          <!-- Said where the field is, not only on the button: by the time
               somebody reads the button they have already cleared it. Under
               the price on a phone, where the fields are a column; across both
               columns from sm up, so appearing mid-edit moves nothing beside
               it. -->
          @if (priceCleared() && published()) {
            <p
              class="-mt-4 text-sm text-amber-700 sm:col-span-2 sm:row-start-2"
            >
              {{ text.priceCleared }}
            </p>
          }

          <div class="w-full sm:col-start-2 sm:row-start-1 sm:w-auto">
            <span appFieldLabel>
              {{ text.category }}
              <span class="text-accent" aria-hidden="true">*</span>
              @if (catalogOwned()) {
                <app-locked-field-marker />
              }
            </span>
            <app-category-picker
              [categories]="categories()"
              [value]="categoryId()"
              [placeholder]="text.categoryPlaceholder"
              [ariaLabel]="text.category"
              [disabled]="catalogOwned()"
              (valueChange)="categoryId.set($event)"
            />
          </div>
        </div>

        <!-- Only where the deployment actually has tiers: with none, the base
             price is the whole pricing story and an empty section would only
             raise a question the admin cannot act on. -->
        @if (otherTiers().length > 0) {
          <div>
            <app-product-tier-prices-editor
              [tiers]="otherTiers()"
              [basePrice]="basePriceText()"
              [value]="tierPrices()"
              [disabled]="catalogOwned()"
              (valueChange)="tierPrices.set($event)"
            />
          </div>
        }

        <!-- The product's two identifiers, side by side: the one the shop
             addresses it by and the one the source system knows it as. They
             are read and corrected together, and neither is worth a full line
             of a 48rem form. One per line below sm, like every other pair on
             this page. -->
        <div class="grid gap-x-6 gap-y-6 sm:grid-cols-2">
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
              @if (catalogOwned()) {
                <app-locked-field-marker />
              }
            </span>
            <input
              type="text"
              appInput
              class="w-full font-mono text-sm"
              [value]="sourceId()"
              [disabled]="catalogOwned()"
              (input)="sourceId.set($any($event.target).value)"
            />
            <span class="mt-1 block text-xs text-subtle">{{
              text.sourceIdHint
            }}</span>
          </label>
        </div>

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
            [knownKeys]="attributeKeys()"
            [definitions]="attributeDefinitions()"
            [ownKeys]="ownAttributeKeys()"
            (valueChange)="attributes.set($event)"
          />
        </div>

        <div>
          <app-product-packaging-editor
            [value]="packaging()"
            [priceMinor]="packagingPriceMinor()"
            (valueChange)="packaging.set($event)"
          />
        </div>

        <fieldset class="max-w-xl">
          <legend appFieldLabel>{{ text.stock.heading }}</legend>
          <p class="mb-2 text-xs text-subtle">{{ text.stock.hint }}</p>
          <!-- Both counts in pieces, said in the fields rather than under
               them: the two are one sentence about how much is left, and a
               hint apiece made the block four lines deep for two numbers. -->
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span appFieldLabel>
                {{ text.stock.pieces }}
                @if (catalogOwned()) {
                  <app-locked-field-marker />
                }
              </span>
              <app-unit-field class="w-full" [unit]="pieceSuffix">
                <input
                  type="text"
                  appNumericField="signed"
                  [class]="unitFieldInput"
                  [value]="stockPieces()"
                  [disabled]="catalogOwned()"
                  (input)="stockPieces.set($any($event.target).value)"
                />
              </app-unit-field>
            </label>
            <label class="block">
              <span appFieldLabel>{{ text.stock.threshold }}</span>
              <!-- The figure in force as the placeholder: empty means "work it
                   out from the packaging", and the number that would be worked
                   out is what an empty field then shows. It follows the
                   packaging as it is edited, and there is nothing to show
                   while the stock is untracked — the field is disabled then,
                   and a greyed figure in a greyed field reads as a value. -->
              <app-unit-field class="w-full" [unit]="pieceSuffix">
                <input
                  type="text"
                  appNumericField="integer"
                  [class]="unitFieldInput"
                  [disabled]="parsedStockPieces() === null"
                  [placeholder]="thresholdPlaceholder()"
                  [value]="lowStockThresholdInput()"
                  (input)="
                    lowStockThresholdInput.set($any($event.target).value)
                  "
                />
              </app-unit-field>
            </label>
          </div>
          <!-- The badge itself rather than its name: what the admin is
               choosing is what a customer will see, and the preview panel is
               too far down the page to answer that while typing. As tall as
               the pill either way — 22px, the badge's own height — so entering
               a figure does not nudge the line down as the pill appears. -->
          <p class="mt-3 flex min-h-5.5 items-center gap-2 text-xs text-subtle">
            <span>{{ text.stock.preview }}</span>
            @if (previewAvailability(); as state) {
              <app-product-availability-badge [availability]="state" />
            } @else {
              <span>{{ text.stock.untracked }}</span>
            }
          </p>
        </fieldset>

        <fieldset>
          <legend appFieldLabel>{{ text.lineNote.heading }}</legend>
          <p class="mb-2 text-xs text-subtle">{{ text.lineNote.hint }}</p>
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
            <label class="mt-3 block max-w-xl">
              <span appFieldLabel>{{ text.lineNote.prompt }}</span>
              <input
                type="text"
                appInput
                class="w-full"
                [attr.maxlength]="lineNotePromptMaxLength"
                [value]="lineNotePrompt()"
                [placeholder]="text.lineNote.promptPlaceholder"
                (input)="lineNotePrompt.set($any($event.target).value)"
              />
              <span class="mt-1 block text-xs text-subtle">{{
                text.lineNote.promptHint
              }}</span>
            </label>
          }
        </fieldset>

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
            (valueChange)="images.set($event)"
          />
        </div>
      </div>
    }

    @if (error()) {
      <p class="mt-4 text-sm text-red-700" role="alert">{{ error() }}</p>
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
            <app-admin-icon name="save" class="h-4 w-4" />
            {{ saving() ? common.saving : saveLabel() }}
          </button>
        }
        <!-- Only while the product is off the storefront: publishing is one
             click from the list once it is on. -->
        <!-- Not offered without a price: the server refuses to publish one,
             and a button whose only outcome is that refusal is a worse way of
             saying so than not offering it. The refusal still stands behind
             it — this is the screen agreeing with the rule, not enforcing it. -->
        @if (!published() && !newAndOwned() && !priceCleared()) {
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
              class="h-4 w-4"
            />
            {{ previewing() ? common.resumeEditing : common.preview }}
          </button>
        }
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
        <!-- Cancel puts the admin back where they came from, which for an
             editor opened from the admin list is the admin list — so seeing
             the product as a customer sees it meant saving first. This exit
             discards the same way and lands on the page itself. Only where
             there is a page to land on: the storefront 404s an unpublished
             product. -->
        @if (!isNew && published()) {
          <button
            appButton
            variant="secondary"
            type="button"
            class="gap-2"
            (click)="cancelToPage()"
          >
            <app-admin-icon name="eye" class="h-4 w-4" />
            {{ text.cancelToPage }}
          </button>
        }
      </div>
    }
  `,
})
export class ProductEditorPage implements UnsavedChangesAware {
  private readonly service = inject(AdminCatalogService);
  private readonly tiersService = inject(TiersService);
  private readonly attributesService = inject(AttributesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;
  /** The last rung of the "few left" ladder; the API applies the same figure
   * from the same key. */
  private readonly lowStockFallback =
    inject(DEPLOYMENT_CONFIG).catalog.lowStockThresholdPieces ??
    DEFAULT_LOW_STOCK_THRESHOLD_PIECES;
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly text = inject(ADMIN_TEXT).productEditor;
  protected readonly ownershipText = inject(ADMIN_TEXT).ownership;
  /** The badge wording, shared with the storefront's hidden-products overlay. */
  protected readonly editText = inject(ADMIN_TEXT).editMode;
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
  protected readonly pieceSuffix = this.text.packaging.pieceSuffix;
  protected readonly unitFieldInput = UNIT_FIELD_INPUT;

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
  protected readonly pairings = signal<PairedProduct[]>([]);
  protected readonly documents = signal<LinkedDocument[]>([]);
  protected readonly lineNoteEnabled = signal(false);
  protected readonly lineNotePrompt = signal('');
  /** Kept as strings like the packaging drafts, so a half-typed or
   * deliberately blank figure is not thrown away between keystrokes. */
  protected readonly stockPieces = signal('');
  protected readonly lowStockThresholdInput = signal('');
  protected readonly lineNotePromptMaxLength =
    PRODUCT_LINE_NOTE_PROMPT_MAX_LENGTH;

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

  /** For a new product the slug tracks the name until the admin edits it. */
  protected readonly effectiveSlug = computed(() =>
    this.isNew && !this.slugTouched() ? slugify(this.name()) : this.slug(),
  );

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
      : this.common.save,
  );

  /**
   * Empties a price field left at zero. A price of nothing is no price, and an
   * empty field is how this form says that — so the field is put into that
   * state as soon as it is left, rather than reading as a free product until
   * the save silently turns it into none.
   */
  protected onPriceBlur(): void {
    if (parsePriceInput(this.priceInput(), this.currency) === 0) {
      this.priceInput.set('');
    }
  }

  /** The declared unit for an attribute key, matched as the server matches it:
   * exactly, apart from surrounding whitespace (FR-ATTR-02). */
  private unitFor(key: string): string | null {
    const name = key.trim();
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
      slug: this.effectiveSlug(),
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
      images: this.images(),
      lineNoteEnabled: this.lineNoteEnabled(),
      lineNotePrompt: this.lineNotePrompt().trim() || null,
      availability: this.previewAvailability(),
      // What the marker will say once this is saved, counted the way the
      // storefront counts it: a counterpart that is withdrawn or unpublished
      // keeps its row in the box above and is not a product on offer.
      pairedCount: this.pairings().filter(
        (paired) => !paired.deleted && !paired.unpublished,
      ).length,
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
      this.name.set(product.name);
      this.slug.set(product.slug);
      this.priceInput.set(
        product.priceMinor === null
          ? ''
          : formatPriceInput(product.priceMinor, this.currency),
      );
      this.categoryId.set(product.categoryId);
      this.sourceId.set(product.sourceId);
      this.description.set(product.descriptionHtml);
      this.attributes.set(product.attributes);
      this.ownAttributeKeys.set(product.attributes.map((a) => a.key));
      this.images.set(product.images);
      this.published.set(product.publishedAt !== null);
      this.deleted.set(product.deletedAt !== null);
      this.pairings.set(product.pairings);
      this.documents.set(product.documents);
      this.lineNoteEnabled.set(product.lineNoteEnabled);
      this.lineNotePrompt.set(product.lineNotePrompt ?? '');
      this.stockPieces.set(product.stockPieces?.toString() ?? '');
      this.lowStockThresholdInput.set(
        product.lowStockThresholdPieces?.toString() ?? '',
      );
      this.packaging.set({
        piecesPerPack: product.piecesPerPack?.toString() ?? '',
        packsPerBox: product.packsPerBox?.toString() ?? '',
        minPieceQty: product.minPieceQty.toString(),
        // Shown with the deployment's own decimal separator, like a price:
        // the column holds "0.072" whatever the locale, and a form that prints
        // 18,90 beside 0.072 looks like two different products' data.
        boxVolume: this.showDecimal(product.boxVolume),
        boxWeight: this.showDecimal(product.boxWeight),
        // A box ships as one unless told otherwise, and the rule is shown the
        // way the minimum is. Without a box there is nothing to count, and the
        // field is disabled and empty.
        boxCount:
          product.packsPerBox === null ? '' : product.boxCount.toString(),
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
      name: this.name(),
      slug: this.effectiveSlug(),
      price: this.priceInput(),
      categoryId: this.categoryId(),
      sourceId: this.sourceId(),
      description: this.description(),
      attributes: this.attributes(),
      images: this.images(),
      tierPrices: this.tierPrices(),
      pairings: this.pairings(),
      documents: this.documents(),
      packaging: this.packaging(),
      lineNoteEnabled: this.lineNoteEnabled(),
      lineNotePrompt: this.lineNotePrompt(),
      stockPieces: this.stockPieces(),
      lowStockThresholdPieces: this.lowStockThresholdInput(),
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

  /** Turning the note off drops the prompt with it — that is what a save
   * stores, and leaving the text behind would show the form as unsaved. */
  protected onLineNoteToggle(enabled: boolean): void {
    this.lineNoteEnabled.set(enabled);
    if (!enabled) this.lineNotePrompt.set('');
  }

  protected onSlugInput(value: string): void {
    this.slugTouched.set(true);
    this.slug.set(value);
  }

  protected async save(andPublish = false): Promise<void> {
    if (!this.name().trim()) return this.error.set(this.text.nameRequired);
    if (!this.categoryId()) return this.error.set(this.text.categoryRequired);
    // An empty field is "no price", a real state; anything else that will not
    // parse is a typo and is refused.
    const priceMinor = this.priceCleared()
      ? null
      : parsePriceInput(this.priceInput(), this.currency);
    if (!this.priceCleared() && priceMinor === null) {
      return this.error.set(this.text.priceInvalid);
    }

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
      // A zero is dropped rather than written, the same reading the field
      // above gets: the list keeps no price of its own and is charged the
      // storefront's, which is what an emptied field already means here.
      if (tierMinor === 0) continue;
      tierPrices.push({ tierId: draft.tierId, priceMinor: tierMinor });
    }

    const packaging = this.packagingInput();
    if (packaging === null) return this.error.set(this.text.packaging.invalid);
    if (!minimumFitsPacks(packaging)) {
      return this.error.set(this.text.packaging.minMustFitPacks);
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
      // Half-filled rows are dropped: a value with no name is meaningless, and
      // a name with no value states nothing.
      attributes: this.storedAttributes(),
      images: this.images(),
      // The full set: a tier the admin cleared is absent here, and the server
      // takes that as "remove the override".
      tierPrices,
      // The whole set, from this product's side: a counterpart removed here is
      // removed from that product too, because one pairing is one row.
      pairedSlugs: this.pairings().map((p) => p.slug),
      // The whole set from this product's side too, and only this side: the
      // document keeps every other product it is shown on (FR-DOC-02).
      documentIds: this.documents().map((d) => d.id),
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

  /** The same discard, ignoring where the editor was opened from: the point of
   * this one is the destination. Guarded by the same canDeactivate. */
  protected cancelToPage(): void {
    const existingSlug = this.slugParam;
    if (existingSlug === null) return;
    void this.router.navigateByUrl(`/product/${existingSlug}`);
  }
}
