import { Directive, inject } from '@angular/core';
import { Router } from '@angular/router';

/**
 * Sends a click on a root-relative link inside a rich-text body through the
 * router. The body is plain HTML, so its anchors carry no routerLink, and
 * without this a link to `/catalog` reloads the whole app. Anything the
 * browser should handle itself — another site, mail, phone, a new tab — is
 * left alone.
 */
@Directive({
  selector: '[appRichTextLinks]',
  host: { '(click)': 'onClick($event)' },
})
export class RichTextLinks {
  private readonly router = inject(Router);

  protected onClick(event: MouseEvent): void {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const href = (event.target as Element)
      .closest('a[href]')
      ?.getAttribute('href');
    if (href && /^\/(?!\/)/.test(href)) {
      event.preventDefault();
      void this.router.navigateByUrl(href);
    }
  }
}
