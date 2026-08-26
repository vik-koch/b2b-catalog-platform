import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { LISTING_NARROW } from './product-tile';
import { ProductRow } from './product-row';
import { packagedPackaging, productListItem } from './product.fixture';

const text = defaultAppText.cart;

const item = productListItem({
  slug: 'filter-roast',
  name: 'Filter Roast',
  packaging: { ...packagedPackaging },
  prices: {
    pieceMilliMinor: 1250,
    pieceLotMinor: 7500,
    pack: 7000,
    box: 27000,
  },
});

/** A host, because what a row is for is carrying what its caller projects. */
@Component({
  imports: [ProductRow],
  template: `
    <app-product-row [item]="item" [available]="available">
      <span rowSelect>tick</span>
      <span rowOverlay class="absolute" data-testid="overlay">pencil</span>
      <p data-testid="own-words">a note</p>
      <button rowActions type="button">bin</button>
    </app-product-row>
  `,
})
class Host {
  item = item;
  available = true;
}

async function render(available = true) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
    ],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.available = available;
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ProductRow', () => {
  it('names the product as a heading that links to it', async () => {
    const el = await render();

    expect(el.querySelector('h2')?.textContent).toContain('Filter Roast');
    expect(el.querySelector('a[href="/product/filter-roast"]')).not.toBeNull();
  });

  // The point of the row: a listing and the cart sell the same way.
  it('carries the buying controls a card carries', async () => {
    const el = await render();

    expect(el.querySelector('[role=radiogroup]')).not.toBeNull();
    expect(el.querySelector(`[aria-label="${text.increase}"]`)).not.toBeNull();
    expect(el.textContent).toContain(text.add);
    // The minimum goes with the quantity, the packaging with the price.
    expect(el.textContent).toContain('Minimum order');
    expect(el.textContent).toContain('Packaging');
  });

  it('takes a tick box, a line’s own words, and an action from the caller', async () => {
    const el = await render();

    expect(el.textContent).toContain('tick');
    expect(el.textContent).toContain('a note');
    expect(el.textContent).toContain('bin');
  });

  // A line is wide: a cluster pinned to *its* corner lands on the controls.
  it('pins what acts on the product over the photo', async () => {
    const el = await render();

    const photo = el.querySelector('app-tile-gallery');
    const overlay = el.querySelector('[data-testid=overlay]');
    expect(overlay?.parentElement).toBe(photo?.parentElement);
    expect(photo?.parentElement?.className).toContain('relative');
  });

  // Below this width a line and a card are the same drawing, so the width
  // itself may not drift apart: the card names it, the line reads it back.
  it('leaves its narrow shape where a card leaves its own', async () => {
    const el = await render();

    const narrow = `@max-[${LISTING_NARROW}]/line:`;
    const photo = el.querySelector('app-tile-gallery')?.parentElement;
    expect(photo?.className).toContain(narrow);
    expect(photo?.nextElementSibling?.className).toContain(narrow);
  });

  // How the photo and the controls arrange themselves within the line is
  // measured on what the tick box left them, not on the line.
  it('measures itself from the photo on, not from the tick box', async () => {
    const el = await render();

    const measured =
      el.querySelector('app-tile-gallery')?.parentElement?.parentElement;
    expect(measured?.className).toContain('@container/row');
    expect(measured?.textContent).not.toContain('tick');
  });

  // A note field the caller projects belongs under the name, and drops to the
  // photo's own bottom edge where the name leaves it room.
  it('puts what the caller projects under the name', async () => {
    const el = await render();

    const column = el.querySelector('[data-testid=own-words]')?.parentElement;
    expect(column?.querySelector('h2')).not.toBeNull();
    expect(column?.className).toContain('flex-col');
  });

  // A price the shop has withdrawn is not a price to keep quoting.
  it('states no figure for a product that can no longer be priced', async () => {
    const el = await render(false);

    expect(el.textContent).toContain(text.noPrice);
    expect(el.textContent).not.toContain('12,50');
  });
});
