import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CHECKOUT_DRAFT_KEY,
  CHECKOUT_DRAFT_VERSION,
  CheckoutDraftService,
} from './checkout-draft.service';

function service(platformId = 'browser'): CheckoutDraftService {
  TestBed.configureTestingModule({
    providers: [{ provide: PLATFORM_ID, useValue: platformId }],
  });
  return TestBed.inject(CheckoutDraftService);
}

describe('CheckoutDraftService', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('starts on the answers the form arrives with', () => {
    const draft = service().draft();

    expect(draft.fulfilmentMethod).toBe('delivery');
    expect(draft.paymentMethod).toBe('cash');
    expect(draft.party).toBe('account');
    expect(draft.billingSameAsDelivery).toBe(true);
  });

  it('keeps answers across a fresh instance', () => {
    service().patch({ fulfilmentMethod: 'pickup', pickupLocationKey: 'quay' });
    TestBed.resetTestingModule();

    const draft = service().draft();
    expect(draft.fulfilmentMethod).toBe('pickup');
    expect(draft.pickupLocationKey).toBe('quay');
  });

  it('discards a draft written by a version that read it differently', () => {
    sessionStorage.setItem(
      CHECKOUT_DRAFT_KEY,
      JSON.stringify({
        version: CHECKOUT_DRAFT_VERSION + 1,
        draft: { fulfilmentMethod: 'pickup' },
      }),
    );

    expect(service().draft().fulfilmentMethod).toBe('delivery');
  });

  it('falls back where a stored choice is outside what the form can draw', () => {
    sessionStorage.setItem(
      CHECKOUT_DRAFT_KEY,
      JSON.stringify({
        version: CHECKOUT_DRAFT_VERSION,
        draft: { fulfilmentMethod: 'teleport', paymentMethod: 'crypto' },
      }),
    );

    const draft = service().draft();
    expect(draft.fulfilmentMethod).toBe('delivery');
    expect(draft.paymentMethod).toBe('cash');
  });

  it('forgets the draft once its order exists', () => {
    const drafts = service();
    drafts.patch({ customerNote: 'ring the bell' });
    drafts.clear();

    expect(drafts.draft().customerNote).toBeNull();
    expect(sessionStorage.getItem(CHECKOUT_DRAFT_KEY)).toBeNull();
  });

  it('touches no storage on the server', () => {
    const drafts = service('server');
    drafts.patch({ fulfilmentMethod: 'pickup' });

    expect(sessionStorage.getItem(CHECKOUT_DRAFT_KEY)).toBeNull();
    expect(drafts.draft().fulfilmentMethod).toBe('pickup');
  });
});
