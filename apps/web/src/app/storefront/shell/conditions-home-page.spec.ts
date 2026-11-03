import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConditionsHomePage } from './conditions-home-page';

@Component({ selector: 'app-conditions-page', template: '<ng-content />' })
class ConditionsPageStub {}

@Component({ selector: 'app-delivery-zone-list', template: '' })
class DeliveryZoneListStub {}

describe('ConditionsHomePage', () => {
  it('puts the delivery zones inside the conditions page', () => {
    TestBed.overrideComponent(ConditionsHomePage, {
      set: { imports: [ConditionsPageStub, DeliveryZoneListStub] },
    });
    const fixture = TestBed.createComponent(ConditionsHomePage);
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'app-conditions-page app-delivery-zone-list',
      ),
    ).not.toBeNull();
  });
});
