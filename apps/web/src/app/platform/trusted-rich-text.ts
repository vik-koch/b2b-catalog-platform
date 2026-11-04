import { inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Bypasses Angular's sanitizer, which would strip an image's placement: the
 * server sanitizes every write. Memoized, as a fresh SafeHtml each check would
 * re-render the body. Call in an injection context.
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
