import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { CatalogImage } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { ProductGallery } from './product-gallery';

const img = (n: number): CatalogImage => ({
  url: `https://img.example/${n}.jpg`,
  alt: `alt ${n}`,
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
    expect(mainSrc(f)).toBe('https://img.example/1.jpg');
  });

  it('swaps the main image when a thumbnail is selected', () => {
    const f = render([img(1), img(2), img(3)]);
    const buttons = (f.nativeElement as HTMLElement).querySelectorAll('button');

    (buttons[1] as HTMLButtonElement).click();
    f.detectChanges();

    expect(mainSrc(f)).toBe('https://img.example/2.jpg');
  });

  it('shows no thumbnail strip for a single image', () => {
    const f = render([img(1)]);

    expect(
      (f.nativeElement as HTMLElement).querySelectorAll('button').length,
    ).toBe(0);
    expect(mainSrc(f)).toBe('https://img.example/1.jpg');
  });
});
