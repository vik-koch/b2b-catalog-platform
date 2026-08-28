import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  injectEditorReturn,
  injectEditorReturnParams,
} from './editor-return';

@Component({ template: '' })
class Blank {}

/**
 * Both halves of the return path are read *late*, and that is the whole point:
 * Angular reuses a component across a navigation that only changes its route
 * parameters, so a value captured at construction describes the page the
 * visitor has already left.
 */
describe('editor return', () => {
  async function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'catalog/:slug', component: Blank },
          { path: 'admin/categories/:slug/filters', component: Blank },
        ]),
      ],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/catalog/coffee');
    return router;
  }

  it('follows the opener across a parameter-only navigation', async () => {
    const router = await setup();
    const params = TestBed.runInInjectionContext(() =>
      injectEditorReturnParams(),
    );
    expect(params().from).toBe('/catalog/coffee');

    await router.navigateByUrl('/catalog/arabica');
    expect(params().from).toBe('/catalog/arabica');
  });

  it('closes to the `from` in force when it is called', async () => {
    const router = await setup();
    await router.navigateByUrl(
      '/admin/categories/coffee/filters?from=%2Fcatalog%2Fcoffee',
    );
    const close = TestBed.runInInjectionContext(() => injectEditorReturn());

    await router.navigateByUrl(
      '/admin/categories/arabica/filters?from=%2Fcatalog%2Farabica',
    );
    await close('/admin/categories');
    expect(router.url).toBe('/catalog/arabica');
  });

  it('refuses a `from` that leaves the app', async () => {
    const router = await setup();
    await router.navigateByUrl(
      '/admin/categories/coffee/filters?from=%2F%2Fevil.example',
    );
    const close = TestBed.runInInjectionContext(() => injectEditorReturn());

    await close('/catalog/coffee');
    expect(router.url).toBe('/catalog/coffee');
  });
});
