import { Component } from '@angular/core';
import { ConditionsPage } from '../site/pages/conditions-page';
import { DeliveryZoneList } from '../ordering/checkout/ui/delivery-zone-list';

/** `/conditions`: the editable page, with checkout's delivery zones in it. */
@Component({
  selector: 'app-conditions-home-page',
  imports: [ConditionsPage, DeliveryZoneList],
  template: `
    <app-conditions-page>
      <app-delivery-zone-list [spread]="true" />
    </app-conditions-page>
  `,
})
export class ConditionsHomePage {}
