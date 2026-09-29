import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductImage, ProductVariant } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { ProductVariantGallery } from './product-variants';

const text = defaultAppText.catalog.variants;

const picture = (n: number, variant: string | null): ProductImage => ({
  full: `https://img.example/full/${n}.jpg`,
  thumb: `https://img.example/thumb/${n}.jpg`,
  variant,
});

/** A range shot, two of sand, one of slate; terracotta is out for now and
 * olive has no picture yet. */
const images = [
  picture(1, null),
  picture(2, 'Sand'),
  picture(3, 'Sand'),
  picture(4, 'Slate'),
];
const variants: ProductVariant[] = [
  { name: 'Sand', unavailable: false },
  { name: 'Slate', unavailable: false },
  { name: 'Terracotta', unavailable: true },
  { name: 'Olive', unavailable: false },
];

function render(
  given: { images?: ProductImage[]; variants?: ProductVariant[] } = {},
): ComponentFixture<ProductVariantGallery> {
  TestBed.configureTestingModule({
    imports: [ProductVariantGallery],
    providers: [{ provide: APP_TEXT, useValue: defaultAppText }],
  });
  const fixture = TestBed.createComponent(ProductVariantGallery);
  fixture.componentRef.setInput('images', given.images ?? images);
  fixture.componentRef.setInput('variants', given.variants ?? variants);
  fixture.componentRef.setInput('productName', 'Cappuccino Cup Set');
  fixture.detectChanges();
  return fixture;
}

const el = (f: ComponentFixture<ProductVariantGallery>) =>
  f.nativeElement as HTMLElement;

const mainImage = (f: ComponentFixture<ProductVariantGallery>) =>
  el(f).querySelector<HTMLImageElement>('[data-main-image] img');

const chip = (f: ComponentFixture<ProductVariantGallery>, name: string) =>
  Array.from(
    el(f).querySelectorAll<HTMLButtonElement>(
      'app-product-variant-list button',
    ),
  ).find((button) => button.textContent?.trim() === name);

const pressed = (f: ComponentFixture<ProductVariantGallery>) =>
  Array.from(
    el(f).querySelectorAll('app-product-variant-list [aria-pressed="true"]'),
  ).map((button) => button.textContent?.trim());

describe('ProductVariantGallery', () => {
  it('lists every variant under the pictures, in the shop’s order', () => {
    const f = render();
    const names = Array.from(
      el(f).querySelectorAll('app-product-variant-list li'),
    ).map((item) => item.textContent?.replace(/\s+/g, ' ').trim());

    expect(names).toEqual([
      'Sand',
      'Slate',
      `Terracotta · ${text.unavailable}`,
      'Olive',
    ]);
  });

  it('brings a variant’s first picture into the gallery when it is pointed at, and keeps it there', () => {
    const f = render();

    chip(f, 'Slate')?.dispatchEvent(new MouseEvent('mouseenter'));
    f.detectChanges();
    expect(mainImage(f)?.getAttribute('src')).toBe(
      'https://img.example/full/4.jpg',
    );

    chip(f, 'Slate')?.dispatchEvent(new MouseEvent('mouseleave'));
    f.detectChanges();
    expect(mainImage(f)?.getAttribute('src')).toBe(
      'https://img.example/full/4.jpg',
    );
  });

  it('answers a tap and keyboard focus as it answers a pointer', () => {
    const f = render();

    chip(f, 'Sand')?.click();
    f.detectChanges();
    expect(mainImage(f)?.getAttribute('src')).toBe(
      'https://img.example/full/2.jpg',
    );

    chip(f, 'Slate')?.dispatchEvent(new FocusEvent('focus'));
    f.detectChanges();
    expect(mainImage(f)?.getAttribute('src')).toBe(
      'https://img.example/full/4.jpg',
    );
  });

  it('marks the variant of the picture on show, however it got there', () => {
    const f = render();
    expect(pressed(f)).toEqual([]);

    // The gallery's own thumbnail, not the list: the list follows it.
    const thumbnails = el(f).querySelectorAll<HTMLButtonElement>(
      'app-product-gallery li button',
    );
    thumbnails[2].click();
    f.detectChanges();

    expect(pressed(f)).toEqual(['Sand']);
  });

  it('lists a variant with no picture on show without offering to show one', () => {
    const f = render();

    expect(chip(f, 'Olive')).toBeUndefined();
    expect(chip(f, 'Terracotta')).toBeUndefined();
  });

  it('names the variant a picture shows in its text alternative, and prints nothing over it', () => {
    const f = render();

    chip(f, 'Sand')?.click();
    f.detectChanges();

    expect(mainImage(f)?.alt).toBe('Cappuccino Cup Set — Sand');
    expect(el(f).querySelector('[data-main-image]')?.textContent?.trim()).toBe(
      '',
    );
  });

  it('is the gallery alone for a product that names no variants', () => {
    const f = render({ images: [picture(1, null)], variants: [] });

    expect(el(f).querySelector('app-product-variant-list')).toBeNull();
    expect(mainImage(f)?.alt).toBe('Cappuccino Cup Set');
  });
});
