import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Session-scoped routes are client-rendered. Nothing about them is
  // crawler-visible, nobody cold-loads /admin or /account, and the server can't
  // resolve a session anyway (see AuthService) — so server-rendering them only
  // ever produced the signed-out placeholder. Client rendering lets the guards
  // settle the session *before* the page is activated, which is why these
  // routes need no gate component and no hydration dance.
  { path: 'login', renderMode: RenderMode.Client },
  { path: 'register', renderMode: RenderMode.Client },
  { path: 'admin', renderMode: RenderMode.Client },
  { path: 'admin/products', renderMode: RenderMode.Client },
  { path: 'admin/categories', renderMode: RenderMode.Client },
  { path: 'admin/sync', renderMode: RenderMode.Client },
  { path: 'admin/tiers', renderMode: RenderMode.Client },
  { path: 'admin/categories/new', renderMode: RenderMode.Client },
  { path: 'admin/categories/:slug/edit', renderMode: RenderMode.Client },
  { path: 'admin/products/new', renderMode: RenderMode.Client },
  { path: 'admin/products/:slug/edit', renderMode: RenderMode.Client },
  { path: 'admin/pages/:slug/edit', renderMode: RenderMode.Client },
  { path: 'account', renderMode: RenderMode.Client },
  { path: 'change-password', renderMode: RenderMode.Client },
  // Everything else is content, and server-rendered. The per-deployment config
  // and UI text reach the browser the same way in both modes: injected into the
  // document by the Node process.
  { path: '**', renderMode: RenderMode.Server },
];
