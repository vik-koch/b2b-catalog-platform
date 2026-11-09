import { HttpInterceptorFn } from '@angular/common/http';
import { inject, REQUEST } from '@angular/core';

import { requireEnv } from '../../../env';
import { sessionCookieIn } from './session-cookie';

/** The visitor's session cookie, and only it, to API_URL only, so a server
 * render is drawn for them rather than a guest. */
export const forwardSession: HttpInterceptorFn = (req, next) => {
  const cookie = sessionCookieIn(
    inject(REQUEST, { optional: true })?.headers.get('cookie'),
  );
  if (!cookie || !isApiUrl(req.url)) return next(req);
  return next(req.clone({ setHeaders: { cookie } }));
};

/** The visitor's address as Traefik set it, so the API's rate limits count
 * visitors rather than this process. The API trusts one hop either way. */
export const forwardVisitorAddress: HttpInterceptorFn = (req, next) => {
  const address = inject(REQUEST, { optional: true })?.headers.get(
    'x-forwarded-for',
  );
  if (!address || !isApiUrl(req.url)) return next(req);
  return next(req.clone({ setHeaders: { 'x-forwarded-for': address } }));
};

function isApiUrl(url: string): boolean {
  const base = requireEnv('API_URL').replace(/\/+$/, '');
  return (
    url === base || url.startsWith(`${base}/`) || url.startsWith(`${base}?`)
  );
}
