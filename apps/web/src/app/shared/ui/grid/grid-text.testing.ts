import { Provider } from '@angular/core';
import { provideTestUiText } from '../ui-text.testing';
import { GRID_TEXT, GridText } from './grid-text';

/** Stand-in words for the grid's specs. */
export const testGridText: GridText = {
  clearFilters: 'Clear filters',
  resizeColumn: 'Drag to resize',
  resizeColumnOfAria: 'Resize {column}',
  resetWidths: 'Reset widths',
  filters: 'Filters',
  sort: 'Sort',
  sortDefault: 'Default order',
  sortAscending: '{column}, ascending',
  sortDescending: '{column}, descending',
  countSuffix: '({count})',
};

/** The grid's words and the lib's, which its pagination reads. */
export function provideTestGridText(): Provider[] {
  return [{ provide: GRID_TEXT, useValue: testGridText }, provideTestUiText()];
}
