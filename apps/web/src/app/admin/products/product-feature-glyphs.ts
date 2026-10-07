import { Component, inject, input } from '@angular/core';
import { ProductFeature } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { AdminIcon, AdminIconName } from '../../ui/icons/admin-icon';

/**
 * One glyph per thing a product can carry (FR-ADM-20), shared by the grid row,
 * the grid's filter chips and the editor's section headings, so each is learnt
 * once. Variants, sets and pairings are the storefront's own glyphs.
 */
export const PRODUCT_FEATURE_GLYPHS: Record<ProductFeature, AdminIconName> = {
  featured: 'star',
  variants: 'palette',
  note: 'message-circle',
  set: 'layers-2',
  pairings: 'package-plus',
  documents: 'file-text',
};

/**
 * The glyphs of what a product carries, in a row. Each is named by its tooltip
 * and, for a screen reader, in words, because a phone has no hover and a glyph
 * is not a name.
 */
@Component({
  selector: 'app-product-feature-glyphs',
  imports: [AdminIcon],
  template: `
    @if (features().length) {
      <ul class="flex items-center gap-1.5 text-subtle">
        @for (feature of features(); track feature) {
          <li class="flex" [title]="text[feature]">
            <app-admin-icon [name]="glyphs[feature]" class="size-3.5" />
            <span class="sr-only">{{ text[feature] }}</span>
          </li>
        }
      </ul>
    }
  `,
})
export class ProductFeatureGlyphs {
  protected readonly text = inject(ADMIN_TEXT).productList.has;
  protected readonly glyphs = PRODUCT_FEATURE_GLYPHS;

  readonly features = input.required<readonly ProductFeature[]>();
}
