import { Route, UrlSegment } from '@angular/router';
import { PAGE_SLUGS } from '@b2b-catalog-platform/shared';
import { NotFoundPage } from './pages/not-found-page';
import { ContactPage } from './pages/contact-page';
import { InquiryPage } from './pages/inquiry-page';
import { Home } from './home/home';
import { Page } from './pages/page';

const isPageSlug = (_: Route, [first]: UrlSegment[]) =>
  (PAGE_SLUGS as readonly string[]).includes(first?.path ?? '');

export const appRoutes: Route[] = [
  { path: '', component: Home },
  // Code pages are declared before the generic :slug route.
  { path: 'contact', component: ContactPage },
  { path: 'inquiry', component: InquiryPage },
  { path: ':slug', component: Page, canMatch: [isPageSlug] },
  { path: '**', component: NotFoundPage },
];
