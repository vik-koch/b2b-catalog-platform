import { ServerRoute } from '@angular/ssr';
import { adminServerRoutes } from './admin/admin.routes.server';
import { storefrontServerRoutes } from './storefront/storefront.routes.server';

// The storefront list ends in its server-rendered catch-all, so the admin
// routes go ahead of it.
export const serverRoutes: ServerRoute[] = [
  ...adminServerRoutes,
  ...storefrontServerRoutes,
];
