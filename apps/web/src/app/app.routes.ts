import { Route, UrlSegment } from '@angular/router';
import { PAGE_SLUGS } from '@b2b-catalog-platform/shared';
import { NotFoundPage } from './pages/not-found-page';
import { ContactPage } from './pages/contact-page';
import { Home } from './home/home';
import { Page } from './pages/page';

const isPageSlug = (_: Route, [first]: UrlSegment[]) =>
  (PAGE_SLUGS as readonly string[]).includes(first?.path ?? '');

export const appRoutes: Route[] = [
  { path: '', component: Home },
  // Contact is a code page (map widget), declared before the generic :slug
  // route so it wins over the CMS Page matcher.
  { path: 'contact', component: ContactPage },
  { path: ':slug', component: Page, canMatch: [isPageSlug] },
  { path: '**', component: NotFoundPage },
];
