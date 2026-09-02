import { Component, input } from '@angular/core';

/**
 * Every glyph only an admin ever sees: the rich-text toolbar, the editors, the
 * management screens. Owned Lucide SVGs (ISC); see ADR 0008 (owned primitives).
 *
 * Kept apart from Icon because a `@switch` ships every case it contains, and
 * this set is far the larger of the two. Every component that names one of
 * these is lazy or deferred, which is what keeps the whole thing out of the
 * bundle a visitor downloads — naming one from an eagerly loaded storefront
 * component would drag all of them along, so add the glyph to Icon instead.
 */
export type AdminIconName =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'heading-2'
  | 'heading-3'
  | 'list'
  | 'list-ordered'
  | 'quote'
  | 'link'
  | 'unlink'
  | 'remove-formatting'
  | 'square-split-vertical'
  | 'image'
  | 'eye'
  | 'pencil'
  | 'save'
  | 'x'
  | 'chevron-up'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'plus'
  | 'copy'
  | 'clipboard-paste'
  | 'trash-2'
  | 'image-plus'
  | 'grip-vertical'
  | 'circle-check'
  | 'book-check'
  | 'book-dashed'
  | 'circle-slash'
  | 'rotate-ccw'
  | 'upload'
  | 'square-menu'
  | 'send'
  | 'package'
  | 'clipboard-list'
  | 'users'
  | 'wrench'
  | 'lock'
  | 'funnel'
  | 'funnel-x'
  | 'triangle-alert'
  | 'circle-alert';

@Component({
  selector: 'app-admin-icon',
  host: { class: 'inline-flex' },
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-full w-full"
      aria-hidden="true"
    >
      @switch (name()) {
        @case ('bold') {
          <path
            d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"
          />
        }
        @case ('italic') {
          <line x1="19" x2="10" y1="4" y2="4" />
          <line x1="14" x2="5" y1="20" y2="20" />
          <line x1="15" x2="9" y1="4" y2="20" />
        }
        @case ('underline') {
          <path d="M6 4v6a6 6 0 0 0 12 0V4" />
          <line x1="4" x2="20" y1="20" y2="20" />
        }
        @case ('strikethrough') {
          <path d="M16 4H9a3 3 0 0 0-2.83 4" />
          <path d="M14 12a4 4 0 0 1 0 8H6" />
          <line x1="4" x2="20" y1="12" y2="12" />
        }
        @case ('heading-2') {
          <path d="M4 12h8" />
          <path d="M4 18V6" />
          <path d="M12 18V6" />
          <path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1" />
        }
        @case ('heading-3') {
          <path d="M4 12h8" />
          <path d="M4 18V6" />
          <path d="M12 18V6" />
          <path d="M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2" />
          <path d="M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2" />
        }
        @case ('list') {
          <path d="M3 5h.01" />
          <path d="M3 12h.01" />
          <path d="M3 19h.01" />
          <path d="M8 5h13" />
          <path d="M8 12h13" />
          <path d="M8 19h13" />
        }
        @case ('list-ordered') {
          <path d="M11 5h10" />
          <path d="M11 12h10" />
          <path d="M11 19h10" />
          <path d="M4 4h1v5" />
          <path d="M4 9h2" />
          <path d="M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02" />
        }
        @case ('quote') {
          <path
            d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"
          />
          <path
            d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"
          />
        }
        @case ('link') {
          <path
            d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
          />
          <path
            d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
          />
        }
        @case ('unlink') {
          <path
            d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"
          />
          <path
            d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"
          />
          <line x1="8" x2="8" y1="2" y2="5" />
          <line x1="2" x2="5" y1="8" y2="8" />
          <line x1="16" x2="16" y1="19" y2="22" />
          <line x1="19" x2="22" y1="16" y2="16" />
        }
        @case ('remove-formatting') {
          <path d="M4 7V4h16v3" />
          <path d="M5 20h6" />
          <path d="M13 4 8 20" />
          <path d="m15 15 5 5" />
          <path d="m20 15-5 5" />
        }
        @case ('square-split-vertical') {
          <path d="M5 8V5c0-1 1-2 2-2h10c1 0 2 1 2 2v3" />
          <path d="M19 16v3c0 1-1 2-2 2H7c-1 0-2-1-2-2v-3" />
          <line x1="4" x2="20" y1="12" y2="12" />
        }
        @case ('image') {
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        }
        @case ('eye') {
          <path
            d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"
          />
          <circle cx="12" cy="12" r="3" />
        }
        @case ('pencil') {
          <path
            d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
          />
          <path d="m15 5 4 4" />
        }
        @case ('save') {
          <path
            d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
          />
          <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
          <path d="M7 3v4a1 1 0 0 0 1 1h7" />
        }
        @case ('x') {
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        }
        @case ('chevron-up') {
          <path d="m18 15-6-6-6 6" />
        }
        @case ('chevron-down') {
          <path d="m6 9 6 6 6-6" />
        }
        @case ('chevron-left') {
          <path d="m15 18-6-6 6-6" />
        }
        @case ('chevron-right') {
          <path d="m9 18 6-6-6-6" />
        }
        @case ('plus') {
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        }
        @case ('copy') {
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        }
        @case ('clipboard-paste') {
          <path
            d="M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1Z"
          />
          <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" />
          <path d="M16 4h2a2 2 0 0 1 2 2v2" />
          <path d="M11 14h10" />
          <path d="m17 10 4 4-4 4" />
        }
        @case ('trash-2') {
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          <line x1="10" x2="10" y1="11" y2="17" />
          <line x1="14" x2="14" y1="11" y2="17" />
        }
        @case ('image-plus') {
          <path d="M16 5h6" />
          <path d="M19 2v6" />
          <path
            d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5"
          />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          <circle cx="9" cy="9" r="2" />
        }
        @case ('grip-vertical') {
          <circle cx="9" cy="12" r="1" />
          <circle cx="9" cy="5" r="1" />
          <circle cx="9" cy="19" r="1" />
          <circle cx="15" cy="12" r="1" />
          <circle cx="15" cy="5" r="1" />
          <circle cx="15" cy="19" r="1" />
        }
        @case ('book-check') {
          <path
            d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"
          />
          <path d="m9 9.5 2 2 4-4" />
        }
        @case ('book-dashed') {
          <path d="M12 17h1.5" />
          <path d="M12 22h1.5" />
          <path d="M12 2h1.5" />
          <path d="M17.5 22H19a1 1 0 0 0 1-1" />
          <path d="M17.5 2H19a1 1 0 0 1 1 1v1.5" />
          <path d="M20 14v3h-2.5" />
          <path d="M20 8.5V10" />
          <path d="M4 10V8.5" />
          <path d="M4 19.5V14" />
          <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H8" />
          <path d="M8 22H6.5a1 1 0 0 1 0-5H8" />
        }
        @case ('circle-check') {
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        }
        @case ('circle-slash') {
          <circle cx="12" cy="12" r="10" />
          <path d="m4.9 4.9 14.2 14.2" />
        }
        @case ('rotate-ccw') {
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        }
        @case ('upload') {
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="M17 8l-5-5-5 5" />
          <path d="M12 3v12" />
        }
        @case ('square-menu') {
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M7 8h10" />
          <path d="M7 12h10" />
          <path d="M7 16h10" />
        }
        @case ('send') {
          <path
            d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"
          />
          <path d="m21.854 2.147-10.94 10.939" />
        }
        @case ('package') {
          <path
            d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"
          />
          <path d="M12 22V12" />
          <polyline points="3.29 7 12 12 20.71 7" />
          <path d="m7.5 4.27 9 5.15" />
        }
        @case ('clipboard-list') {
          <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
          <path
            d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
          />
          <path d="M12 11h4" />
          <path d="M12 16h4" />
          <path d="M8 11h.01" />
          <path d="M8 16h.01" />
        }
        @case ('users') {
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        }
        @case ('wrench') {
          <path
            d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
          />
        }
        @case ('lock') {
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        }
        @case ('funnel') {
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        }
        @case ('funnel-x') {
          <path d="M13.013 3H2l8 9.46V19l4 2v-8.54l.9-1.055" />
          <path d="m22 3-5 5" />
          <path d="m17 3 5 5" />
        }
        @case ('triangle-alert') {
          <path
            d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"
          />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        }
        @case ('circle-alert') {
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        }
      }
    </svg>
  `,
})
export class AdminIcon {
  readonly name = input.required<AdminIconName>();
}
