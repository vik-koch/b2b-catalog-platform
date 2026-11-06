import { ApplicationRef, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FirstRender } from './first-render';

function setUp(platform: 'browser' | 'server'): FirstRender {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: PLATFORM_ID, useValue: platform }],
  });
  return TestBed.inject(FirstRender);
}

describe('FirstRender', () => {
  it('holds in the browser until a render has run', async () => {
    const first = setUp('browser');
    expect(first.over()).toBe(false);
    expect(first.interactive()).toBe(false);

    TestBed.inject(ApplicationRef).tick();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(first.over()).toBe(true);
    expect(first.interactive()).toBe(true);
  });

  it('never holds on the server, which has no browser state to keep back', () => {
    expect(setUp('server').over()).toBe(true);
  });

  it('is never interactive on the server, where input would be lost', () => {
    expect(setUp('server').interactive()).toBe(false);
  });
});
