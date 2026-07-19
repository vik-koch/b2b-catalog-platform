import { Route, UrlSegment } from '@angular/router';
import { PAGE_SLUGS } from '@b2b-catalog-platform/shared';
import { NotFound } from './core/not-found';
import { Home } from './home/home';
import { Page } from './pages/page';

const isPageSlug = (_: Route, [first]: UrlSegment[]) =>
  (PAGE_SLUGS as readonly string[]).includes(first?.path ?? '');

export const appRoutes: Route[] = [
  { path: '', component: Home },
  { path: ':slug', component: Page, canMatch: [isPageSlug] },
  { path: '**', component: NotFound },
];
