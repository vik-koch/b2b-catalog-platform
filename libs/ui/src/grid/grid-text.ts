import { InjectionToken } from '@angular/core';

/** The words every DataGrid says, from the app's admin texts. */
export interface GridText {
  readonly clearFilters: string;
  readonly resizeColumn: string;
  /** `{column}`: the boundary being dragged. */
  readonly resizeColumnOfAria: string;
  readonly resetWidths: string;
  readonly filters: string;
  readonly sort: string;
  /** The ordering a grid has when nothing is chosen. */
  readonly sortDefault: string;
  /** `{column}`, one line of the narrow sort picker each. */
  readonly sortAscending: string;
  readonly sortDescending: string;
  /** `{count}` beside the word it counts: active filters. */
  readonly countSuffix: string;
}

export const GRID_TEXT = new InjectionToken<GridText>('GRID_TEXT');
