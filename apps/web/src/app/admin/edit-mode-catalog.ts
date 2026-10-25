import { inject, Injector, Provider } from '@angular/core';
import { EDIT_MODE_CATALOG } from '../shared/edit-mode/edit-mode-catalog';

/** Hands edit mode the admin catalog client, loaded on first use. */
export function provideEditModeCatalog(): Provider {
  return {
    provide: EDIT_MODE_CATALOG,
    useFactory: () => {
      const injector = inject(Injector);
      return () =>
        import('./admin-catalog.service').then(({ AdminCatalogService }) =>
          injector.get(AdminCatalogService),
        );
    },
  };
}
