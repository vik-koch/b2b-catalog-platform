import { getDeploymentConfig } from '../../../shared/config/deployment-config.server';
import { CART_STORAGE_KEY, CART_STORAGE_VERSION } from './cart-storage';
import { moneyFormat } from '@b2b-catalog-platform/shared/platform';

/** The inline `<head>` script that draws the navbar's cart figures before first
 * paint: the server cannot read localStorage, and anything Angular corrects is
 * a second picture. It writes two custom properties and a class on `<html>` for
 * styles.css (`.cart-filled`); CartFigures keeps them. The total is formatted
 * twice, here and in `formatPriceMinorShort`: the spec checks they agree, and a
 * throw is swallowed. */
function buildCartShellScript(): string {
  const { code, locale } = moneyFormat(getDeploymentConfig());
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

/** Before `</head>`, in SSR pages and the client shell alike. */
export function injectCartShell(html: string): string {
  cachedScript ??= buildCartShellScript();
  return html.replace('</head>', `${cachedScript}</head>`);
}
