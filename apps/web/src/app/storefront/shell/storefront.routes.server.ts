import { RenderMode, ServerRoute } from '@angular/ssr';

export const storefrontServerRoutes: ServerRoute[] = [
  // Session routes render in the browser, where the guards settle the session
  // before activation.
  { path: 'login', renderMode: RenderMode.Client },
  { path: 'register', renderMode: RenderMode.Client },
  { path: 'forgot-password', renderMode: RenderMode.Client },
  { path: 'set-password', renderMode: RenderMode.Client },
  { path: 'account/**', renderMode: RenderMode.Client },
  { path: 'change-password', renderMode: RenderMode.Client },
  // The cart lives in localStorage, which the server cannot read.
  { path: 'cart', renderMode: RenderMode.Client },
  // The form that orders it, for the same reason.
  { path: 'checkout', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Server },
];
