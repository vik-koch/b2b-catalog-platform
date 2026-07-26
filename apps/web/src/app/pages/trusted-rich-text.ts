import { inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Rich-text bodies are already sanitized server-side — the single trust
 * boundary, applied on every write, so the database only ever holds safe HTML.
 * Angular's own `[innerHTML]` sanitizer is therefore redundant here, and it
 * strips exactly the img `data-align`/`data-width`/`style` that carry image
 * placement. Bypass it.
 *
 * Returns a memoizing function so an unchanged string yields the same SafeHtml
 * instance: a fresh one on every change detection would re-render the body (and
 * can trip ExpressionChanged checks). Call it from an injection context.
 */
export function trustedRichText(): (html: string) => SafeHtml {
  const sanitizer = inject(DomSanitizer);
  let lastHtml: string | undefined;
  let lastSafe: SafeHtml = '';
  return (html) => {
    if (html !== lastHtml) {
      lastHtml = html;
      lastSafe = sanitizer.bypassSecurityTrustHtml(html);
    }
    return lastSafe;
  };
}
