import { Component, input } from '@angular/core';

/**
 * Every glyph the storefront itself draws. Owned Lucide SVGs (ISC); see ADR
 * 0008 (owned primitives).
 *
 * The set is deliberately small and deliberately separate from AdminIcon: a
 * `@switch` ships every case it contains, so anything named here is downloaded
 * by every visitor on every cold hit. The admin glyphs live in their own
 * component precisely so the editor's toolbar does not ride along.
 *
 * `pencil`, `trash-2`, `folder-plus` and `file-plus` are here despite being
 * edit-mode affordances (EditActions): they sit in ordinary `@if` blocks inside eagerly
 * loaded storefront components, and `@if` is a rendering condition, not a code
 * split. Moving them out would mean deferring the affordances themselves, which
 * would cost the pop-free rendering the storefront just gained.
 *
 * Size via a height/width class on the element (`class="h-5 w-5"`); colour
 * follows `currentColor`.
 */
export type IconName =
  | 'calendar'
  | 'chevron-right'
  | 'chevron-down'
  | 'chevron-up'
  | 'close'
  | 'mail'
  | 'menu'
  | 'phone'
  | 'search'
  | 'store'
  | 'user'
  | 'lock'
  | 'pencil'
  | 'funnel'
  | 'trash-2'
  | 'minus'
  | 'shopping-basket'
  | 'circle-user-round'
  | 'circle-check'
  | 'book-check'
  | 'book-dashed'
  | 'layout-grid'
  | 'layout-list'
  | 'message-circle-plus'
  | 'message-circle-check'
  | 'folder-plus'
  | 'file-plus'
  | 'plus';

@Component({
  selector: 'app-icon',
  host: { class: 'inline-flex' },
  // Set as a property rather than as the SVG's own stroke-width attribute: a
  // presentation attribute on the element beats any value inherited from an
  // ancestor, so a caller asking for a heavier glyph would be ignored. As a
  // custom property it inherits, and anything above the icon can raise it.
  styles: `
    svg {
      stroke-width: var(--icon-stroke-width, 1.75);
    }
  `,
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-full w-full"
      aria-hidden="true"
    >
      @switch (name()) {
        @case ('chevron-right') {
          <path d="m9 18 6-6-6-6" />
        }
        @case ('chevron-down') {
          <path d="m6 9 6 6 6-6" />
        }
        @case ('chevron-up') {
          <path d="m18 15-6-6-6 6" />
        }
        @case ('close') {
          <path d="M18 6 6 18M6 6l12 12" />
        }
        @case ('mail') {
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        }
        @case ('menu') {
          <path d="M4 6h16M4 12h16M4 18h16" />
        }
        @case ('phone') {
          <path
            d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"
          />
        }
        @case ('calendar') {
          <path d="M8 2v4" />
          <path d="M16 2v4" />
          <rect width="18" height="18" x="3" y="4" rx="2" />
          <path d="M3 10h18" />
        }
        @case ('search') {
          <path d="m21 21-4.34-4.34" />
          <circle cx="11" cy="11" r="8" />
        }
        @case ('store') {
          <path
            d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"
          />
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
          <path d="M2 7h20" />
          <path
            d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"
          />
        }
        @case ('user') {
          <circle cx="12" cy="8" r="5" />
          <path d="M20 21a8 8 0 0 0-16 0" />
        }
        @case ('lock') {
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        }
        @case ('pencil') {
          <path
            d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
          />
          <path d="m15 5 4 4" />
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
        @case ('funnel') {
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        }
        @case ('trash-2') {
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          <line x1="10" x2="10" y1="11" y2="17" />
          <line x1="14" x2="14" y1="11" y2="17" />
        }
        @case ('minus') {
          <path d="M5 12h14" />
        }
        @case ('shopping-basket') {
          <path d="m15 11-1 9" />
          <path d="m19 11-4-7" />
          <path d="M2 11h20" />
          <path
            d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4"
          />
          <path d="M4.5 15.5h15" />
          <path d="m5 11 4-7" />
          <path d="m9 11 1 9" />
        }
        @case ('circle-check') {
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        }
        @case ('circle-user-round') {
          <path d="M17.925 20.056a6 6 0 0 0-11.851.001" />
          <circle cx="12" cy="11" r="4" />
          <circle cx="12" cy="12" r="10" />
        }
        @case ('message-circle-plus') {
          <path
            d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"
          />
          <path d="M8 12h8" />
          <path d="M12 8v8" />
        }
        @case ('message-circle-check') {
          <path
            d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"
          />
          <path d="m9 12 2 2 4-4" />
        }
        @case ('layout-grid') {
          <rect width="7" height="7" x="3" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="14" rx="1" />
          <rect width="7" height="7" x="3" y="14" rx="1" />
        }
        @case ('layout-list') {
          <rect width="7" height="7" x="3" y="3" rx="1" />
          <rect width="7" height="7" x="3" y="14" rx="1" />
          <path d="M14 4h7" />
          <path d="M14 9h7" />
          <path d="M14 15h7" />
          <path d="M14 20h7" />
        }
        @case ('folder-plus') {
          <path
            d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
          />
          <path d="M12 10v6" />
          <path d="M9 13h6" />
        }
        @case ('file-plus') {
          <path
            d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"
          />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          <path d="M9 15h6" />
          <path d="M12 18v-6" />
        }
        @case ('plus') {
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        }
      }
    </svg>
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
}
