import { Component } from '@angular/core';
import { AccountPage } from '../accounts/account/account-page';
import { RecentOrders } from '../ordering/orders/recent-orders';

/** `/account`: the account's own page, with its newest orders in it. */
@Component({
  selector: 'app-account-home-page',
  imports: [AccountPage, RecentOrders],
  template: `
    <app-account-page>
      <app-recent-orders />
    </app-account-page>
  `,
})
export class AccountHomePage {}
