import {
  HttpHeaders,
  HttpInterceptorFn,
  HttpResponse,
} from '@angular/common/http';
import { inject, RESPONSE_INIT } from '@angular/core';
import { tap } from 'rxjs';

/** The page as private as the most private answer it embeds, judged by what
 * the render asked and got, not by who asked. After `forwardSession`. */
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
