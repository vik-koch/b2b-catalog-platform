import { Provider } from '@angular/core';

import { CartAddition, ProductCart, ProductInCart } from './product-cart';

/** An in-memory cart for specs that render the buying controls without testing
 * the cart itself; the real one is ordering's. */
class FakeProductCart implements ProductCart {
  private readonly lines = new Map<string, ProductInCart>();

  lineFor(slug: string): ProductInCart | undefined {
    return this.lines.get(slug);
  }

  add(addition: CartAddition): 'added' {
    this.setLine(addition);
    return 'added';
  }

  setLine({ slug, unit, pieces, note }: CartAddition): void {
    this.lines.set(slug, { unit, pieces, note });
  }

  setNote(slug: string, note: string | null): void {
    const line = this.lines.get(slug);
    if (line) this.lines.set(slug, { ...line, note });
  }

  remove(slug: string): void {
    this.lines.delete(slug);
  }
}

export function provideFakeProductCart(): Provider {
  return { provide: ProductCart, useClass: FakeProductCart };
}
