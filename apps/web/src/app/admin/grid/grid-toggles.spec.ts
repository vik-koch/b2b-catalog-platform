import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { GridToggleGroup } from './grid-column';
import { GridToggles } from './grid-toggles';

@Component({
  imports: [GridToggles],
  template: `<app-grid-toggles [groups]="groups()" />`,
})
class Host {
  readonly groups = signal<GridToggleGroup[]>([]);
}

const group = (selected: string[]): GridToggleGroup => ({
  label: 'Missing',
  param: 'missing',
  options: [
    { value: 'incomplete', label: 'Incomplete' },
    { value: 'picture', label: 'No picture', icon: 'image' },
  ],
  selected,
});

async function render(url: string, selected: string[]) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [provideRouter([{ path: '**', children: [] }])],
  });
  const router = TestBed.inject(Router);
  await router.navigateByUrl(url);
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.groups.set([group(selected)]);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === label,
    )!;
  const query = () =>
    TestBed.inject(Router).routerState.root.snapshot.queryParamMap;
  return { fixture, el, button, query, route: TestBed.inject(ActivatedRoute) };
}

describe('GridToggles (FR-ADM-20)', () => {
  it('names its group and says which chips are on', async () => {
    const { el, button } = await render('/admin/products', ['picture']);

    expect(el.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(
      'Missing',
    );
    expect(button('No picture').getAttribute('aria-pressed')).toBe('true');
    expect(button('Incomplete').getAttribute('aria-pressed')).toBe('false');
  });

  it('adds a chip to the ones already on, and drops the page', async () => {
    const { fixture, button, query } = await render(
      '/admin/products?missing=picture&page=3',
      ['picture'],
    );

    button('Incomplete').click();
    await fixture.whenStable();

    expect(query().getAll('missing')).toEqual(['picture', 'incomplete']);
    expect(query().has('page')).toBe(false);
  });

  it('clears the parameter when the last chip goes off', async () => {
    const { fixture, button, query } = await render(
      '/admin/products?missing=picture&state=live',
      ['picture'],
    );

    button('No picture').click();
    await fixture.whenStable();

    expect(query().has('missing')).toBe(false);
    expect(query().get('state')).toBe('live');
  });
});
