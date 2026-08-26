import { PLATFORM_ID, REQUEST } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProductLayoutService, readProductLayout } from './product-layout';

function service(options: { cookie?: string; server?: boolean } = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: options.server ? 'server' : 'browser' },
      {
        provide: REQUEST,
        useValue: options.server
          ? new Request('http://localhost/catalog', {
              headers: options.cookie ? { cookie: options.cookie } : {},
            })
          : null,
      },
    ],
  });
  return TestBed.inject(ProductLayoutService);
}

describe('readProductLayout', () => {
  it('reads the layout out of a cookie header', () => {
    expect(readProductLayout('a=1; product_layout=list; b=2')).toBe('list');
  });

  it('answers nothing for a value that is not a layout', () => {
    // The cookie is editable by hand, so anything unrecognised is nothing.
    expect(readProductLayout('product_layout=cards')).toBeNull();
    expect(readProductLayout(undefined)).toBeNull();
  });
});

describe('ProductLayoutService', () => {
  beforeEach(() => {
    document.cookie = 'product_layout=;path=/;max-age=0';
  });

  it('starts on cards, which is what a catalogue looks like', () => {
    expect(service().layout()).toBe('grid');
  });

  it('remembers the choice in a cookie', () => {
    const layout = service();

    layout.set('list');

    expect(layout.layout()).toBe('list');
    expect(document.cookie).toContain('product_layout=list');
    // And a page loaded afterwards starts where the visitor left off.
    expect(service().layout()).toBe('list');
  });

  // The listings are server-rendered, so the first HTML has to be the layout
  // the visitor chose — otherwise the page rearranges itself after hydration.
  it('reads the request’s cookie on the server', () => {
    expect(
      service({ server: true, cookie: 'product_layout=list' }).layout(),
    ).toBe('list');
    expect(service({ server: true }).layout()).toBe('grid');
  });
});
