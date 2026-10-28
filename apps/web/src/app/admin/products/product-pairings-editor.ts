import {
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { fillText, PRODUCT_PAIRINGS_MAX } from '@b2b-catalog-platform/shared';
import {
  AdminProductListItem,
  PairedProduct,
} from '@b2b-catalog-platform/shared/admin';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { HighlightedLine } from '../../shared/ui/highlighted-line';
import { MatchSegmentsPipe } from '../../shared/catalog/match-segments.pipe';
import { AlternateLayout } from '../../shared/core/alternate-layout';
import { SuggestList } from '../../shared/ui/suggest-list';
import { DisclosureToggle } from '@b2b-catalog-platform/ui/disclosure/disclosure-toggle';
import { DisclosureFrame } from '@b2b-catalog-platform/ui/disclosure/disclosure-frame';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { PRODUCT_FEATURE_GLYPHS } from './product-feature-glyphs';
import { Input } from '../../shared/ui/input';
import { StatusBadge } from '@b2b-catalog-platform/ui/content/status-badge';
import { SuggestField } from '../../shared/ui/suggest-field';
import { SuggestInput } from '../../shared/ui/suggest-input';
import { SuggestRow } from '../../shared/ui/suggest-row';
import { AdminCatalogService } from '../admin-catalog.service';
import { xIcon } from '@b2b-catalog-platform/ui/icons/glyphs/x';

/** `aria-controls` must name one list, and a page may hold more than one. */
let nextId = 0;

/** Enough rows to choose from without the panel becoming a listing of its own. */
const SUGGESTIONS_SHOWN = 8;

/**
 * The products this one is sold together with (FR-SET-01) — a search field that
 * suggests products by name, and the counterparts picked so far.
 *
 * A disclosure rather than a checkbox, though it hides the same way the note
 * prompt does: there is no stored flag here to check. A checkbox would be a
 * control whose off state has no meaning — unchecking it either loses the
 * pairings silently or lies about them — while the lid's count says how many
 * there are without opening it, which is the thing an admin scrolling past
 * wants to know.
 *
 * Counterparts that are deleted or unpublished are listed **marked**, not
 * dropped: a soft delete is reversible and an unpublished product is usually
 * one still being prepared, so the link an admin made outlives both. They are
 * simply not offered as new ones — a deleted product is not something to start
 * selling alongside.
 */
@Component({
  selector: 'app-product-pairings-editor',
  imports: [
    Icon,
    DisclosureToggle,
    FieldLabel,
    HighlightedLine,
    MatchSegmentsPipe,
    IconButton,
    Input,
    StatusBadge,
    SuggestField,
    SuggestInput,
    SuggestRow,
    DisclosureFrame,
  ],
  host: { class: 'block' },
  template: `
    <!-- The attribute picker's box: lid, count, and one border around
         everything it opens. -->
    <div class="max-w-xl rounded-md border" appDisclosureFrame [open]="open()">
      <app-disclosure-toggle
        [label]="product.pairings"
        [count]="value().length"
        [countLabel]="countLabel()"
        [open]="open()"
        [panelId]="panelId"
        (toggled)="open.set(!open())"
      >
        <app-icon
          disclosureLead
          [glyph]="glyph"
          class="size-4 text-ink-subtle"
        />
      </app-disclosure-toggle>
      @if (open()) {
        <div [id]="panelId" class="border-t border-edge p-4">
          <p class="text-xs text-ink-subtle">{{ text.hint }}</p>

          @if (value().length > 0) {
            <ul class="mt-3 divide-y divide-edge border-y border-edge">
              @for (item of value(); track item.slug) {
                <li class="flex items-center gap-2 py-1.5 text-sm">
                  <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
                  @if (item.deleted) {
                    <span appStatusBadge tone="danger">
                      {{ productStates.deleted }}
                    </span>
                  } @else if (item.unpublished) {
                    <span appStatusBadge tone="waiting">
                      {{ productStates.unpublished }}
                    </span>
                  }
                  <button
                    appIconButton
                    type="button"
                    [attr.aria-label]="removeLabel(item)"
                    (click)="remove(item.slug)"
                  >
                    <app-icon [glyph]="xIcon" />
                  </button>
                </li>
              }
            </ul>
          }

          @if (value().length >= max) {
            <p class="mt-3 text-xs text-ink-subtle">{{ limitLabel() }}</p>
          } @else {
            <div class="mt-3">
              <label [for]="inputId" appFieldLabel>{{ text.add }}</label>
              <app-suggest-field
                [list]="list"
                [text]="text"
                (picked)="add($event)"
              >
                <input
                  [id]="inputId"
                  autocomplete="off"
                  appInput
                  appSuggestInput
                  class="w-full"
                  [value]="query()"
                  [placeholder]="text.addPlaceholder"
                  (input)="query.set($any($event.target).value)"
                />
                <ng-template
                  appSuggestRow
                  [of]="list"
                  let-item
                  let-query="query"
                >
                  <span class="block truncate">
                    <app-highlighted-line
                      [segments]="
                        item.name | matchSegments: query : alternateQuery()
                      "
                    />
                  </span>
                  @if (item.publishedAt === null) {
                    <span class="block text-xs text-ink-subtle">
                      {{ productStates.unpublished }}
                    </span>
                  }
                </ng-template>
              </app-suggest-field>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class ProductPairingsEditor implements OnInit {
  protected readonly xIcon = xIcon;
  private readonly service = inject(AdminCatalogService);
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly text = inject(ADMIN_TEXT).products.editor.pairings;
  protected readonly product = inject(SHARED_TEXT).product;
  protected readonly productStates = inject(ADMIN_TEXT).products;
  protected readonly glyph = PRODUCT_FEATURE_GLYPHS.pairings;

  readonly value = input.required<readonly PairedProduct[]>();
  /**
   * The product being edited, so it cannot be offered as its own counterpart.
   * Null while it has no slug yet — a new product cannot be in the catalog the
   * search reads, so there is nothing to exclude.
   */
  readonly ownSlug = input<string | null>(null);

  readonly valueChange = output<PairedProduct[]>();

  protected readonly max = PRODUCT_PAIRINGS_MAX;
  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly panelId = `pairings-panel-${++nextId}`;
  protected readonly inputId = `pairing-search-${nextId}`;

  /**
   * One name is enough of a query here: this searches our own catalog rather
   * than a metered provider, and an admin pairing a lid types "lid".
   */
  protected readonly list = new SuggestList<AdminProductListItem>({
    load: (q) =>
      this.service.listProducts({ q, sort: 'relevance' }).then((r) => r.items),
    minLength: 2,
    /**
     * What is actually offerable: not this product, not one already paired,
     * and not a deleted one. Filtered here rather than in the query because the
     * grid endpoint answers the same question the grid asks — "all states" —
     * and the three exclusions are about this form, not about the catalog.
     */
    shown: (answer) => {
      const taken = new Set(this.value().map((p) => p.slug));
      const own = this.ownSlug();
      return answer
        .filter(
          (item) =>
            item.deletedAt === null &&
            item.slug !== own &&
            !taken.has(item.slug),
        )
        .slice(0, SUGGESTIONS_SHOWN);
    },
  });
  private readonly layout = inject(AlternateLayout);
  protected readonly alternateQuery = computed(() =>
    this.layout.of(this.list.query()),
  );

  protected readonly countLabel = computed(() =>
    fillText(this.adminText.countSuffix, { count: this.value().length }),
  );

  protected readonly limitLabel = computed(() =>
    fillText(this.text.limit, { count: this.max }),
  );

  /** Open where there is something to see. Read once, in `ngOnInit`: a panel
   * that closed itself when the last pairing was removed would take the field
   * that puts one back with it. */
  ngOnInit(): void {
    this.open.set(this.value().length > 0);
  }

  protected add(item: AdminProductListItem): void {
    this.valueChange.emit([
      ...this.value(),
      {
        slug: item.slug,
        name: item.name,
        deleted: false,
        unpublished: item.publishedAt === null,
      },
    ]);
    // The field empties on a pick: the next one is a different search, and a
    // panel of matches for the name just chosen is a list of what to skip.
    this.query.set('');
  }

  protected remove(slug: string): void {
    this.valueChange.emit(this.value().filter((p) => p.slug !== slug));
  }

  protected removeLabel(item: PairedProduct): string {
    return fillText(this.text.removeAria, { name: item.name });
  }
}
