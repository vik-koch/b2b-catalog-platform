import { Component } from '@angular/core';

/**
 * Lucide "user". Owned SVG (ISC); see ADR 0008 (owned primitives). Size via a
 * height/width class on the element (e.g. `class="h-6 w-6"`); colour follows
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
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </svg>
  `,
})
export class UserIcon {}
