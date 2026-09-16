import { inject, Injectable } from '@angular/core';
import { Params, Router } from '@angular/router';
import { adminText } from '../../config/admin-text';
import { ConfirmService } from '../../ui/confirm.service';
import { SettingsService } from '../settings/settings.service';

/**
 * The one gesture "add a product" makes, wherever it is offered: the admin
 * listing's button and the storefront's ＋ disc in edit mode.
 *
 * While an external system owns the catalog, products are created there — so
 * the control opens the explanation rather than an editor that could only
 * refuse the save. It stays on screen either way: a control that vanishes
 * teaches nobody why.
 *
 * The route behind it keeps its own refusal, and so does the API. This only
 * spares somebody filling a form that is going to be rejected.
 */
@Injectable({ providedIn: 'root' })
export class ProductCreateService {
  private readonly ownership = inject(SettingsService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);

  /**
   * Warm the ownership answer up where the screen is certain to need it. The
   * storefront does not: its cluster only exists in edit mode, and asking on
   * every category page would put an admin-only request on every visit.
   */
  prepare(): void {
    void this.ownership.load();
  }

  async start(queryParams?: Params): Promise<void> {
    // Awaited rather than read: on the storefront this click is the first
    // thing that asks, and a cold "not owned" would open the editor anyway.
    const owned = (await this.ownership.load()).includes('catalog');
    const text = adminText();
    if (text && owned) {
      await this.confirm.tell({
        heading: text.editMode.addProduct,
        message: text.ownership.productCreate,
        closeLabel: text.common.close,
      });
      return;
    }
    void this.router.navigate(['/admin/products/new'], { queryParams });
  }
}
