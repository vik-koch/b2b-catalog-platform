import { inject, Provider } from '@angular/core';
import { ADMIN_TEXT } from '../shared/config/admin-text';
import { GRID_TEXT, GridText } from '../shared/ui/grid/grid-text';

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
