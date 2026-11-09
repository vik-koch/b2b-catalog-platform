import { inject, Provider } from '@angular/core';

import { GRID_TEXT, GridText } from '@b2b-catalog-platform/ui/grid/grid-text';

import { ADMIN_TEXT } from '../../platform/config/admin-text';

/** The grid's words. Lazy: only a grid injects it, after the admin guard. */
export function provideGridText(): Provider {
  return {
    provide: GRID_TEXT,
    useFactory: (): GridText => {
      const text = inject(ADMIN_TEXT);
      return { ...text.grid, countSuffix: text.countSuffix };
    },
  };
}
