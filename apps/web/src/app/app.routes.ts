import { Route } from '@angular/router';
import { adminRoutes } from './admin/admin.routes';
import { storefrontRoutes } from './storefront/storefront.routes';

// The storefront list ends in its catch-all page and not-found routes, so
// the admin routes go ahead of it.
export const appRoutes: Route[] = [...adminRoutes, ...storefrontRoutes];
