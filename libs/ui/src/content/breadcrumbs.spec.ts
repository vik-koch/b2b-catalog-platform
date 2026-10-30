import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Breadcrumbs, Crumb } from './breadcrumbs';

@Component({
  imports: [Breadcrumbs],
  template: `
    <ui-breadcrumbs
      label="Trail"
      [crumbs]="crumbs()"
      current="Cups"
      [currentFrom]="currentFrom()"
    />
  `,
})
class Host {
  readonly crumbs = signal<readonly Crumb[]>([
    { label: 'Catalog', link: '/catalog' },
    {
      label: 'Tableware',
      link: ['/catalog', 'tableware'],
      queryParams: { sort: 'price' },
    },
  ]);
  readonly currentFrom = signal<'sm' | null>(null);
}

async function render() {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('Breadcrumbs', () => {
  it('links every crumb and marks the page itself as current', async () => {
    const { el } = await render();
    const links = [...el.querySelectorAll('a')];

    expect(links.map((a) => a.textContent?.trim())).toEqual([
      'Catalog',
      'Tableware',
    ]);
    expect(links[1].getAttribute('href')).toBe('/catalog/tableware?sort=price');
    expect(el.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe(
      'Cups',
    );
    expect(el.querySelector('nav')?.getAttribute('aria-label')).toBe('Trail');
  });

  it('separates crumbs without reading the separators out', async () => {
    const { el } = await render();
    const items = [...el.querySelectorAll('li')];

    expect(items).toHaveLength(5);
    expect(items.filter((li) => li.getAttribute('aria-hidden'))).toHaveLength(
      2,
    );
  });

  it('is the page alone with no crumbs', async () => {
    const { el, fixture } = await render();
    fixture.componentInstance.crumbs.set([]);
    await fixture.whenStable();

    expect(el.querySelectorAll('li')).toHaveLength(1);
  });

  it('leaves the page and its separator out below sm when asked', async () => {
    const { el, fixture } = await render();
    fixture.componentInstance.currentFrom.set('sm');
    await fixture.whenStable();
    const items = [...el.querySelectorAll('li')];

    expect(items.slice(-2).every((li) => li.classList.contains('hidden'))).toBe(
      true,
    );
  });
});
