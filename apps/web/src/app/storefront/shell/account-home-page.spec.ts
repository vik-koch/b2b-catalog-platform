import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { WorkService } from '../../core/work/work.service';
import { workStub } from '../../core/work/work.fixture';
import { AccountHomePage } from './account-home-page';

@Component({ selector: 'app-account-page', template: '<ng-content />' })
class AccountPageStub {}

@Component({ selector: 'app-recent-orders', template: '' })
class RecentOrdersStub {
  readonly payments = input<number>();
  readonly pickups = input<number>();
}

describe('AccountHomePage', () => {
  function render() {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: WorkService,
          useValue: workStub({ myPayments: 2, myPickups: 1 }),
        },
      ],
    });
    TestBed.overrideComponent(AccountHomePage, {
      set: { imports: [AccountPageStub, RecentOrdersStub] },
    });
    const fixture = TestBed.createComponent(AccountHomePage);
    fixture.detectChanges();
    return fixture;
  }

  it('puts the newest orders inside the account page', () => {
    const fixture = render();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'app-account-page app-recent-orders',
      ),
    ).not.toBeNull();
  });

  it('hands the orders what waits on the holder', () => {
    const orders = render().debugElement.query(By.directive(RecentOrdersStub))
      .componentInstance as RecentOrdersStub;

    expect(orders.payments()).toBe(2);
    expect(orders.pickups()).toBe(1);
  });
});
