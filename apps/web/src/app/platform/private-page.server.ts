import {
  HttpHeaders,
  HttpInterceptorFn,
  HttpResponse,
} from '@angular/common/http';
import { inject, RESPONSE_INIT } from '@angular/core';
import { tap } from 'rxjs';

/**
 * Makes the rendered page as private as the most private thing it embeds.
 *
 * The transfer cache is told to carry answers Angular would refuse by default
 * (hydration.ts): ones asked for with a cookie, and ones marked `private`,
 * `no-store` or `no-cache` or setting a cookie. Each of those lands in the
 * page, so the page must not be kept by anyone but its visitor. Decided from
 * what the render actually asked and got — not from who is asking — so a
 * future read that is personal for some other reason cannot end up in a page
 * a shared cache may keep.
 *
 * Runs after `forwardSession`, so a forwarded cookie is on the request it sees.
 */
export const keepPagePrivate: HttpInterceptorFn = (req, next) => {
  const page = inject(RESPONSE_INIT, { optional: true });
  if (!page) return next(req);
  if (req.headers.has('cookie') || req.headers.has('authorization')) {
    markPrivate(page);
  }
  return next(req).pipe(
    tap((event) => {
      if (event instanceof HttpResponse && isPersonal(event.headers)) {
        markPrivate(page);
      }
    }),
  );
};

const PERSONAL_DIRECTIVES = new Set(['private', 'no-store', 'no-cache']);

function isPersonal(headers: HttpHeaders): boolean {
  if (headers.has('set-cookie')) return true;
  return (headers.get('cache-control') ?? '')
    .split(',')
    .some((directive) =>
      PERSONAL_DIRECTIVES.has(directive.split('=')[0].trim().toLowerCase()),
    );
}

function markPrivate(page: ResponseInit): void {
  const headers = new Headers(page.headers);
  headers.set('Cache-Control', 'private, no-store');
  page.headers = headers;
}
