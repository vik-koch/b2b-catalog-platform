import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { CatalogImage } from '@b2b-catalog-platform/shared';
import { TileGallery } from './tile-gallery';

const img = (n: number): CatalogImage => ({
  url: `https://img.example/${n}.jpg`,
  alt: `alt ${n}`,
});

function render(images: CatalogImage[]): ComponentFixture<TileGallery> {
  TestBed.configureTestingModule({
    imports: [TileGallery],
    providers: [provideRouter([])],
  });
  const fixture = TestBed.createComponent(TileGallery);
  fixture.componentRef.setInput('images', images);
  fixture.componentRef.setInput('link', ['/product', 'p1']);
  fixture.detectChanges();
  return fixture;
}

/** Index of the currently-visible (opacity-100) image. */
function activeIndex(f: ComponentFixture<TileGallery>): number {
  const imgs = [...(f.nativeElement as HTMLElement).querySelectorAll('img')];
  return imgs.findIndex((el) => el.classList.contains('opacity-100'));
}

describe('TileGallery', () => {
  it('links to the product and shows the first image', () => {
    const f = render([img(1), img(2), img(3)]);
    const root = f.nativeElement as HTMLElement;

    expect(root.querySelector('a')?.getAttribute('href')).toBe('/product/p1');
    expect(activeIndex(f)).toBe(0);
  });

  it('scrubs to the image under the cursor on mouse move', () => {
    const f = render([img(1), img(2), img(3)]);
    const anchor = (f.nativeElement as HTMLElement).querySelector(
      'a',
    ) as HTMLAnchorElement;
    anchor.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect;

    // 60% across a 3-image strip → the middle image (index 1).
    anchor.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 60, pointerType: 'mouse' }),
    );
    f.detectChanges();
    expect(activeIndex(f)).toBe(1);

    anchor.dispatchEvent(new PointerEvent('pointerleave'));
    f.detectChanges();
    expect(activeIndex(f)).toBe(0);
  });

  it('renders a progress segment per image when there is more than one', () => {
    const root = render([img(1), img(2), img(3)]).nativeElement as HTMLElement;

    expect(root.querySelectorAll('span').length).toBe(3);
  });

  it('renders no progress segments for a single image', () => {
    const root = render([img(1)]).nativeElement as HTMLElement;

    expect(root.querySelectorAll('span').length).toBe(0);
  });
});
