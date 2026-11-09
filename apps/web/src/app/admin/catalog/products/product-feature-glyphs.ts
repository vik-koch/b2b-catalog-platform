import { Component, inject, input } from '@angular/core';

import { ProductFact } from '@b2b-catalog-platform/shared/admin/catalog';
import { Glyph } from '@b2b-catalog-platform/ui/icons/glyph';
import { boxesIcon } from '@b2b-catalog-platform/ui/icons/glyphs/boxes';
import { fileTextIcon } from '@b2b-catalog-platform/ui/icons/glyphs/file-text';
import { imageIcon } from '@b2b-catalog-platform/ui/icons/glyphs/image';
import { layers2Icon } from '@b2b-catalog-platform/ui/icons/glyphs/layers-2';
import { letterTextIcon } from '@b2b-catalog-platform/ui/icons/glyphs/letter-text';
import { messageCircleIcon } from '@b2b-catalog-platform/ui/icons/glyphs/message-circle';
import { packagePlusIcon } from '@b2b-catalog-platform/ui/icons/glyphs/package-plus';
import { paletteIcon } from '@b2b-catalog-platform/ui/icons/glyphs/palette';
import { starIcon } from '@b2b-catalog-platform/ui/icons/glyphs/star';
import { tablePropertiesIcon } from '@b2b-catalog-platform/ui/icons/glyphs/table-properties';
import { tagIcon } from '@b2b-catalog-platform/ui/icons/glyphs/tag';
import { weightIcon } from '@b2b-catalog-platform/ui/icons/glyphs/weight';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';

import { ADMIN_CATALOG_TEXT } from '../catalog-text';
import { FeatureFact } from './product-facts';

/** One glyph per thing a product can carry (FR-ADM-20), the same in the grid,
 * its filter and the editor. Variants, sets and pairings use the storefront's. */
export const PRODUCT_FEATURE_GLYPHS: Record<FeatureFact, Glyph> = {
  featured: starIcon,
  variants: paletteIcon,
  note: messageCircleIcon,
  set: layers2Icon,
  pairings: packagePlusIcon,
  documents: fileTextIcon,
};

/** A glyph for every fact the grid's filter asks about: the content's own,
 * which only the filter shows, then the features'. */
export const PRODUCT_FACT_GLYPHS: Record<ProductFact, Glyph> = {
  price: tagIcon,
  picture: imageIcon,
  description: letterTextIcon,
  attributes: tablePropertiesIcon,
  packaging: boxesIcon,
  boxFacts: weightIcon,
  ...PRODUCT_FEATURE_GLYPHS,
};

/** Named in words too: a phone has no hover, and a glyph is not a name. */

@Component({
  selector: 'app-product-feature-glyphs',
  imports: [Icon],
  template: `
    @if (features().length) {
      <ul class="flex items-center gap-1.5 text-ink-subtle">
        @for (feature of features(); track feature) {
          <li class="flex" [title]="text[feature]">
            <ui-icon [glyph]="glyphs[feature]" class="size-3.5" />
            <span class="sr-only">{{ text[feature] }}</span>
          </li>
        }
      </ul>
    }
  `,
})
export class ProductFeatureGlyphs {
  protected readonly text = inject(ADMIN_CATALOG_TEXT).products.list.fact;
  protected readonly glyphs = PRODUCT_FEATURE_GLYPHS;

  readonly features = input.required<readonly FeatureFact[]>();
}
