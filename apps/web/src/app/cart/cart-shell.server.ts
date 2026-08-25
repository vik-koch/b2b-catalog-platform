import { getDeploymentConfig } from '../config/deployment-config.server';
import { CART_STORAGE_KEY, CART_STORAGE_VERSION } from './cart-storage';

/**
 * The inline script that draws the navbar's cart figures before the page's
 * first paint.
 *
 * The cart lives in localStorage, which the server cannot read, so every
 * server-rendered page is HTML for an empty cart. Correcting that from Angular
 * — however early — is always a *second* picture: the visitor sees a bare
 * basket and then, a beat later, the count and total appear. The only way to
 * be right the first time is to run before anything is painted, and the only
 * code that can is a synchronous script in `<head>`.
 *
 * It therefore does not touch the header — none of it is parsed yet. It writes
 * two custom properties and a class onto `<html>`, and the stylesheet draws
 * the figures from them (see `.cart-filled` in styles.css). CartLink writes
 * the same three values for the rest of the visit, so nothing changes hands at
 * hydration and there is no second picture.
 *
 * The cost is that the total is formatted twice, here and in
 * `formatPriceMinorShort` — the two must agree, which `cart-shell.server.spec.ts`
 * is what checks. It is a deliberately small duplication: a bad reading is
 * corrected as soon as Angular boots, and a throw is swallowed, so the worst
 * case is the flash this exists to remove.
 */
function buildCartShellScript(): string {
  const { code, locale } = getDeploymentConfig().catalog.currency;
  return `<script>${cartShellSource(locale, code)}</script>`;
}

/** Exported for the spec, which runs it against a seeded localStorage. */
export function cartShellSource(locale: string, code: string): string {
  return `(function(){try{
var s=JSON.parse(localStorage.getItem(${JSON.stringify(CART_STORAGE_KEY)})||'null');
if(!s||s.version!==${CART_STORAGE_VERSION}||!Array.isArray(s.lines)||!s.lines.length)return;
var n=s.lines.length,t=0;
for(var i=0;i<n;i++)t+=s.lines[i].lineTotalMinor||0;
var o={style:'currency',currency:${JSON.stringify(code)}},l=${JSON.stringify(locale)};
var d=new Intl.NumberFormat(l,o).resolvedOptions().maximumFractionDigits;
var u=Math.pow(10,d);
o.minimumFractionDigits=0;o.maximumFractionDigits=0;
var r=document.documentElement;
r.style.setProperty('--cart-count',JSON.stringify(String(n)));
r.style.setProperty('--cart-total',JSON.stringify(new Intl.NumberFormat(l,o).format(t/u)));
r.classList.add('cart-filled');
}catch(e){}})();`;
}

let cachedScript: string | undefined;

/**
 * Injects the script immediately before `</head>`, into server-rendered pages
 * and the client-rendered shell alike — the shell needs it just as much, since
 * its own first paint is also cartless.
 */
export function injectCartShell(html: string): string {
  cachedScript ??= buildCartShellScript();
  return html.replace('</head>', `${cachedScript}</head>`);
}
