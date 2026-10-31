import { inject, Injector, Provider } from '@angular/core';
import { EDIT_MODE_CATALOG } from '../../core/catalog/edit-mode-catalog';

/** Hands edit mode the admin product client, loaded on first use. */
export function provideEditModeCatalog(): Provider {
  return {
    provide: EDIT_MODE_CATALOG,
    useFactory: () => {
      const injector = inject(Injector);
      return () =>
        import('./products/products.service').then(({ ProductsService }) =>
          injector.get(ProductsService),
        );
    },
  };
}
