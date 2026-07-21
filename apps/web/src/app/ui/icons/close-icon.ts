import { Component } from '@angular/core';

/** Lucide "x". Owned SVG (ISC); see ADR 0008 (owned primitives). */
@Component({
  selector: 'app-icon-close',
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
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  `,
})
export class CloseIcon {}
