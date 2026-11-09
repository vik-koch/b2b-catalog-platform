import { inject, Injectable } from '@angular/core';
import { Params, Router } from '@angular/router';

import { CATALOG_AREA } from '@b2b-catalog-platform/shared/core/catalog';
import { ConfirmService } from '@b2b-catalog-platform/ui/overlay/confirm.service';

import { adminText, adminTextBlock } from '../../../platform/config/admin-text';
import { SHARED_TEXT } from '../../../platform/config/shared-text';
import { OwnershipService } from '../../platform/ownership/ownership.service';
import type { AdminCatalogText } from '../catalog-text.type';

/**
 * "Add a product": while the catalog is owned, products are created in the
 * source, so the button explains instead of opening an editor that could only
 * refuse. The route and the API refuse as well.
 */
@Injectable({ providedIn: 'root' })
export class ProductCreateService {
  private readonly actionText = inject(SHARED_TEXT).actions;
  private readonly ownership = inject(OwnershipService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);

  /** Where a screen is certain to need the answer; not on the storefront,
   * where it would be an admin request on every visit. */
  prepare(): void {
    void this.ownership.load();
  }

  async start(queryParams?: Params): Promise<void> {
    // Awaited, not read: a cold answer would open the editor anyway.

    const owned = (await this.ownership.load()).includes('catalog');
    const text = adminText();
    if (text && owned) {
      await this.confirm.tell({
        heading: text.editMode.addProduct,
        message: adminTextBlock<AdminCatalogText>(text, CATALOG_AREA).ownership
          .productCreate,
        closeLabel: this.actionText.close,
      });
      return;
    }
    void this.router.navigate(['/admin/products/new'], { queryParams });
  }
}
