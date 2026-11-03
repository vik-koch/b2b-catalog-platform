import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AccountHomePage } from './account-home-page';

@Component({ selector: 'app-account-page', template: '<ng-content />' })
class AccountPageStub {}

@Component({ selector: 'app-recent-orders', template: '' })
class RecentOrdersStub {}

describe('AccountHomePage', () => {
  it('puts the newest orders inside the account page', () => {
    TestBed.overrideComponent(AccountHomePage, {
      set: { imports: [AccountPageStub, RecentOrdersStub] },
    });
    const fixture = TestBed.createComponent(AccountHomePage);
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'app-account-page app-recent-orders',
      ),
    ).not.toBeNull();
  });
});
