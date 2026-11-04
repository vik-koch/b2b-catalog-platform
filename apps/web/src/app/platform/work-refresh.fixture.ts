import { Provider } from '@angular/core';
import { WorkRefresh } from './work-refresh';

/** The work marker for a spec that renders a screen clearing work: no API. */
export function provideFakeWorkRefresh(): Provider {
  return {
    provide: WorkRefresh,
    useValue: { refresh: () => Promise.resolve() },
  };
}
