import { Route } from '@angular/router';
import { adminRoutes } from './admin/shell/admin.routes';
import { storefrontRoutes } from './storefront/shell/storefront.routes';

// The storefront list ends in its catch-all page and not-found routes, so
// the admin routes go ahead of it.
export const appRoutes: Route[] = [...adminRoutes, ...storefrontRoutes];
