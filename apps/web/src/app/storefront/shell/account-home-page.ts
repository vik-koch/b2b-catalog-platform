import { Component, inject } from '@angular/core';

import { WorkService } from '../../core/work/work.service';
import { AccountPage } from '../accounts/account/account-page';
import { RecentOrders } from '../ordering/orders/recent-orders';

/** `/account`: the account's own page, with its newest orders and what
 * waits on them. */
@Component({
  selector: 'app-account-home-page',
  imports: [AccountPage, RecentOrders],
  template: `
    <app-account-page>
      <app-recent-orders
        [payments]="counts().myPayments"
        [pickups]="counts().myPickups"
      />
    </app-account-page>
  `,
})
export class AccountHomePage {
  protected readonly counts = inject(WorkService).counts;
}
