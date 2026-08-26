import { TestBed } from '@angular/core/testing';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { ProductLayoutService } from './product-layout';
import { ProductLayoutToggle } from './product-layout-toggle';
import { LISTING_NARROW } from './product-tile';

const text = defaultAppText.catalog.layout;

async function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProductLayoutToggle],
    providers: [{ provide: APP_TEXT, useValue: defaultAppText }],
  });
  const fixture = TestBed.createComponent(ProductLayoutToggle);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const buttonFor = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === label,
  );

describe('ProductLayoutToggle', () => {
  beforeEach(() => {
    document.cookie = 'product_layout=;path=/;max-age=0';
  });

  it('says which layout is the current one', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;

    // Two glyphs and no words, so the state has to be readable from the
    // buttons themselves.
    expect(buttonFor(host, text.grid)?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(buttonFor(host, text.list)?.getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('records the choice, and says the other one is pressed now', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;

    buttonFor(host, text.list)?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(TestBed.inject(ProductLayoutService).layout()).toBe('list');
    expect(buttonFor(host, text.list)?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(buttonFor(host, text.grid)?.getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('offers nothing where both layouts draw the same listing', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;

    // On the *listing's* container and on the convergence's own figure — not
    // the `sm` viewport breakpoint it was derived from. The two part company
    // on a viewport with no classic scrollbar, and for that band the control
    // would vanish while the two layouts still looked different.
    expect(host.className).toContain(`@min-[${LISTING_NARROW}]/listing:block`);
    expect(host.className).toContain('hidden');
    expect(host.className).not.toContain('sm:block');
  });
});
