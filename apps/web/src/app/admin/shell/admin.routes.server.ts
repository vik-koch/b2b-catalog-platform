import { RenderMode, ServerRoute } from '@angular/ssr';

/** Every staff page is session-scoped and client-rendered, new ones included. */
export const adminServerRoutes: ServerRoute[] = [
  { path: 'admin/**', renderMode: RenderMode.Client },
];
