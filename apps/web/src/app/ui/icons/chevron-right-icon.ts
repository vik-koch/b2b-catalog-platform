import { Component } from '@angular/core';

/**
 * Lucide "chevron-right". Owned SVG (ISC); see ADR 0008 (owned primitives).
 * Used as a breadcrumb separator. Size via a height/width class; colour follows
 * `currentColor`.
 */
@Component({
  selector: 'app-icon-chevron-right',
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
      <path d="m9 18 6-6-6-6" />
    </svg>
  `,
})
export class ChevronRightIcon {}
