import { Component } from '@angular/core';

/** Lucide "menu". Owned SVG (ISC); see ADR 0008 (owned primitives). */
@Component({
  selector: 'app-icon-menu',
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
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  `,
})
export class MenuIcon {}
