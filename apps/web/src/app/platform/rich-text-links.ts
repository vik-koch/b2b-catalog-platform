import { Directive, inject } from '@angular/core';
import { Router } from '@angular/router';

/** A root-relative link in a rich-text body goes through the router instead
 * of reloading the app; other sites, mail, phone and new tabs are left alone. */
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
