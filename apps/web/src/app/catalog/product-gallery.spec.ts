import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { CatalogImage } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { ProductGallery } from './product-gallery';

const img = (n: number): CatalogImage => ({
  full: `https://img.example/full/${n}.jpg`,
  thumb: `https://img.example/thumb/${n}.jpg`,
});

function render(images: CatalogImage[]): ComponentFixture<ProductGallery> {
  TestBed.configureTestingModule({
    imports: [ProductGallery],
    providers: [{ provide: APP_TEXT, useValue: defaultAppText }],
  });
  const fixture = TestBed.createComponent(ProductGallery);
  fixture.componentRef.setInput('images', images);
  fixture.detectChanges();
  return fixture;
}

const mainSrc = (f: ComponentFixture<ProductGallery>) =>
  (f.nativeElement as HTMLElement)
    .querySelector('.order-1 img')
    ?.getAttribute('src');

describe('ProductGallery', () => {
  it('shows the first image as the main image with a thumbnail per image', () => {
    const f = render([img(1), img(2), img(3)]);
    const buttons = (f.nativeElement as HTMLElement).querySelectorAll('button');

    expect(buttons.length).toBe(3);
    expect(mainSrc(f)).toBe('https://img.example/full/1.jpg');
  });

  it('swaps the main image when a thumbnail is selected', () => {
    const f = render([img(1), img(2), img(3)]);
    const buttons = (f.nativeElement as HTMLElement).querySelectorAll('button');

    (buttons[1] as HTMLButtonElement).click();
    f.detectChanges();

    expect(mainSrc(f)).toBe('https://img.example/full/2.jpg');
  });

  it('shows no thumbnail strip for a single image', () => {
    const f = render([img(1)]);

    expect(
      (f.nativeElement as HTMLElement).querySelectorAll('button').length,
    ).toBe(0);
    expect(mainSrc(f)).toBe('https://img.example/full/1.jpg');
  });

  it('renders the placeholder in the main slot when there are no images', () => {
    const f = render([]);
    const el = f.nativeElement as HTMLElement;

    expect(mainSrc(f)).toBeUndefined();
    expect(el.querySelector('.order-1 app-image-placeholder')).not.toBeNull();
  });

  it('swaps the main image for the placeholder when it fails to load', () => {
    const f = render([img(1)]);
    const el = f.nativeElement as HTMLElement;

    el.querySelector('.order-1 img')?.dispatchEvent(new Event('error'));
    f.detectChanges();

    expect(el.querySelector('.order-1 img')).toBeNull();
    expect(el.querySelector('.order-1 app-image-placeholder')).not.toBeNull();
  });
});
