import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  productSortSchema,
  searchSortSchema,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { defaultAppText } from '../config/app-text.fixture';
import { ProductSortSelect, sortParam } from './product-sort-select';

/** A host page the control can navigate within, so the URL is observable. */
@Component({
  imports: [ProductSortSelect],
  template: `<app-product-sort-select
    [value]="'name'"
    defaultSort="name"
    [withRelevance]="withRelevance"
  />`,
})
class Host {
  withRelevance = false;
}

async function render(
  withRelevance: boolean,
  startUrl = '/catalog/espresso',
  sortControlsEnabled = true,
) {
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [
      provideRouter([{ path: '**', component: Host }]),
      { provide: APP_TEXT, useValue: defaultAppText },
      {
        provide: DEPLOYMENT_CONFIG,
        useValue: {
          ...defaultDeploymentConfig,
          catalog: { ...defaultDeploymentConfig.catalog, sortControlsEnabled },
        },
      },
    ],
  });
  const router = TestBed.inject(Router);
  await router.navigateByUrl(startUrl);

  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.withRelevance = withRelevance;
  fixture.detectChanges();
  await fixture.whenStable();

  const host = fixture.nativeElement as HTMLElement;
  const select = host.querySelector('select');
  if (!select) throw new Error('the control should render a select');

  /** Picks an option the way a visitor would, and waits for the navigation. */
  const choose = async (value: string) => {
    select.value = value;
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  };

  return { router, select, choose };
}

describe('ProductSortSelect', () => {
  /**
   * FR-SEARCH-04's second half: what a deployment switches off is the control.
   * The ordering is the URL's, so a link somebody saved still opens the
   * listing they saved — which is why this asserts the missing control and not
   * a missing sort.
   */
  it('draws nothing where the deployment has turned the control off', async () => {
    await expect(
      render(false, '/catalog/espresso?sort=price', false),
    ).rejects.toThrow(/should render a select/);
  });

  it('offers relevance only where a query can rank it', async () => {
    const withoutQuery = await render(false);
    expect([...withoutQuery.select.options].map((o) => o.value)).toEqual([
      ...productSortSchema.options,
    ]);

    TestBed.resetTestingModule();
    const withQuery = await render(true);
    expect([...withQuery.select.options].map((o) => o.value)).toEqual([
      ...searchSortSchema.options,
    ]);
  });

  it('labels every option from the deployment text', async () => {
    const { select } = await render(true);

    expect([...select.options].map((o) => o.textContent?.trim())).toEqual(
      searchSortSchema.options.map((o) => defaultAppText.catalog.sort[o]),
    );
  });

  it('marks the current sort as an attribute, which is what SSR serialises', async () => {
    // A property write alone leaves the server's HTML with nothing selected,
    // and the rendered page shows the first option until hydration fixes it.
    const { select } = await render(false);

    const marked = [...select.options].filter((o) =>
      o.hasAttribute('selected'),
    );
    expect(marked.map((o) => o.value)).toEqual(['name']);
  });

  it('puts the chosen sort in the URL', async () => {
    const { router, choose } = await render(false);

    await choose('price_desc');

    expect(router.url).toContain('sort=price_desc');
  });

  it('returns to the first page, which the new order has renumbered', async () => {
    const { router, choose } = await render(false, '/catalog/espresso?page=3');

    await choose('price');

    expect(router.url).not.toContain('page=');
  });

  it('leaves the default out of the URL', async () => {
    const { router, choose } = await render(
      false,
      '/catalog/espresso?sort=price',
    );

    await choose('name');

    expect(router.url).not.toContain('sort=');
  });

  it('keeps the rest of the query string, so a search stays a search', async () => {
    const { router, choose } = await render(true, '/search?q=espresso');

    await choose('price');

    expect(router.url).toContain('q=espresso');
  });
});

describe('sortParam', () => {
  it('omits the default so one view has one URL', () => {
    expect(sortParam('name', 'name')).toBeNull();
    expect(sortParam('relevance', 'relevance')).toBeNull();
  });

  it('carries anything else', () => {
    expect(sortParam('price', 'name')).toBe('price');
    // The category default is not the search default: what counts as omissible
    // is the listing's own default, not a globally special value.
    expect(sortParam('name', 'relevance')).toBe('name');
  });
});
