import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { CatalogImage } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { TileGallery } from './tile-gallery';

const img = (n: number): CatalogImage => ({
  full: `https://img.example/full/${n}.jpg`,
  thumb: `https://img.example/thumb/${n}.jpg`,
});

function render(images: CatalogImage[]): ComponentFixture<TileGallery> {
  TestBed.configureTestingModule({
    imports: [TileGallery],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
    ],
  });
  const fixture = TestBed.createComponent(TileGallery);
  fixture.componentRef.setInput('images', images);
  fixture.componentRef.setInput('link', ['/product', 'p1']);
  fixture.componentRef.setInput('productName', 'Test product');
  fixture.detectChanges();
  return fixture;
}

/** A touch event carrying just the one coordinate the component reads. */
function touchEvent(type: string, clientX: number): Event {
  const event = new Event(type);
  Object.defineProperty(event, 'changedTouches', { value: [{ clientX }] });
  return event;
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

  it('shows the placeholder instead of an image when there are none', () => {
    const f = render([]);
    const root = f.nativeElement as HTMLElement;

    expect(root.querySelector('a')?.getAttribute('href')).toBe('/product/p1');
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('app-image-placeholder')).not.toBeNull();
  });

  it('swaps a failed image for the placeholder in its slot', () => {
    const f = render([img(1), img(2)]);
    const root = f.nativeElement as HTMLElement;

    root.querySelectorAll('img')[0].dispatchEvent(new Event('error'));
    f.detectChanges();

    // One slot became a placeholder; the other image is still present.
    expect(root.querySelectorAll('img')).toHaveLength(1);
    expect(root.querySelector('app-image-placeholder')).not.toBeNull();
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

    anchor.dispatchEvent(
      new PointerEvent('pointerleave', { pointerType: 'mouse' }),
    );
    f.detectChanges();
    expect(activeIndex(f)).toBe(0);
  });

  /**
   * A touch pointer fires pointerleave *before* the touchend that ends the
   * swipe. While that reset the selection, every swipe restarted from image 0
   * and the third image was unreachable.
   */
  it('keeps stepping forward across successive touch swipes', () => {
    const f = render([img(1), img(2), img(3)]);
    const anchor = (f.nativeElement as HTMLElement).querySelector(
      'a',
    ) as HTMLAnchorElement;

    const swipeLeft = () => {
      anchor.dispatchEvent(touchEvent('touchstart', 200));
      anchor.dispatchEvent(
        new PointerEvent('pointerleave', { pointerType: 'touch' }),
      );
      anchor.dispatchEvent(touchEvent('touchend', 100));
      f.detectChanges();
    };

    swipeLeft();
    expect(activeIndex(f)).toBe(1);

    swipeLeft();
    expect(activeIndex(f)).toBe(2);
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
