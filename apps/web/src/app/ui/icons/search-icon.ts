import { Component } from '@angular/core';

/**
 * Lucide "search". Owned SVG (ISC); see ADR 0008 (owned primitives). Size via a
 * height/width class on the element (e.g. `class="h-6 w-6"`); colour follows
 * `currentColor`.
 */
@Component({
  selector: 'app-icon-search',
  host: { class: 'inline-flex' },
  template: `
    <svg
      class="h-full w-full"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="m21 21-4.34-4.34" />
      <circle cx="11" cy="11" r="8" />
    </svg>
  `,
})
export class SearchIcon {}
