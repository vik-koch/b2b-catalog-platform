import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { catalogContract } from '@b2b-catalog-platform/shared/storefront/catalog';
import { parseAttributeParams } from '@b2b-catalog-platform/shared/core/catalog';
import { CatalogSearchService } from './catalog-search.service';
import { PricingTier } from '../../auth/pricing-tier.decorator';
import { TierPriced } from '../../auth/tier-priced.decorator';
import {
  SearchThrottle,
  SuggestionThrottle,
} from '../../throttling/throttle-presets';

/** Product search and its type-ahead (FR-SEARCH), tier-priced like the rest
 * of the catalog, and throttled: every request runs the matcher. */
@Controller()
export class SearchController {
  constructor(private readonly search: CatalogSearchService) {}

  @SearchThrottle()
  @TierPriced()
  @Implement(catalogContract.searchProducts)
  searchProducts(@PricingTier() tierId: string | null) {
    return implement(catalogContract.searchProducts).handler(
      ({ input: { query } }) =>
        this.search.searchProducts(
          query.q,
          query.page,
          query.sort,
          tierId,
          parseAttributeParams(query.attr),
        ),
    );
  }

  @SuggestionThrottle()
  @TierPriced()
  @Implement(catalogContract.getSearchSuggestions)
  getSearchSuggestions(@PricingTier() tierId: string | null) {
    return implement(catalogContract.getSearchSuggestions).handler(
      ({ input: { query } }) =>
        this.search.getSearchSuggestions(query.q, tierId),
    );
  }
}
