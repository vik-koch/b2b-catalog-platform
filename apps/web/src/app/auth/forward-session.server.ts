import { HttpInterceptorFn } from '@angular/common/http';
import { inject, REQUEST } from '@angular/core';
import { requireEnv } from '../../env';
import { sessionCookieIn } from './session-cookie';

/**
 * Hands the visitor's session to the API during a server render, so the page
 * is drawn for whoever is asking — their prices, their account control, a real
 * 404 — instead of the guest's.
 *
 * Only the session cookie, and only to API_URL: the render also fetches other
 * things, and a cookie has no business leaving for anywhere the browser itself
 * would not send it.
 *
 * The browser needs no counterpart — the API is same-origin there, so the
 * cookie rides along on its own.
 */
export const forwardSession: HttpInterceptorFn = (req, next) => {
  const cookie = sessionCookieIn(
    inject(REQUEST, { optional: true })?.headers.get('cookie'),
  );
  if (!cookie || !isApiUrl(req.url)) return next(req);
  return next(req.clone({ setHeaders: { cookie } }));
};

/**
 * Hands the API the visitor's address during a server render, so its rate
 * limits count each visitor rather than this process: without it every
 * server-rendered search page or order link in the shop shares one budget,
 * and one busy client spends it for all.
 *
 * Passed on as Traefik set it — Traefik replaces any `X-Forwarded-For` a
 * client sends, and the engine keeps the header only because server.ts trusts
 * it. The API trusts one hop, which reads the same address whether the
 * request came through Traefik or from here.
 */
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
