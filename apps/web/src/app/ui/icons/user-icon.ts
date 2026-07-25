import { Component } from '@angular/core';

/**
 * Lucide "user". Owned SVG (ISC); see ADR 0008 (owned primitives). Size via a
 * height/width class on the element (e.g. `class="h-5 w-5"`); colour follows
 * `currentColor`.
 */
@Component({
  selector: 'app-icon-user',
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
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  `,
})
export class UserIcon {}
