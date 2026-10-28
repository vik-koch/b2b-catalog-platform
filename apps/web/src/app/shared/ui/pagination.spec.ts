import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Pagination } from './pagination';
import { UI_TEXT } from '@b2b-catalog-platform/ui/core/ui-text';

const text = {
  previous: 'Previous',
  next: 'Next',
  status: 'Page {page} of {total}',
};

@Component({
  imports: [Pagination],
  template: `
    <app-pagination
      class="linked"
      link="/orders"
      [page]="page()"
      [totalPages]="total()"
      [queryParams]="params"
    />
    <app-pagination
      class="local"
      [page]="page()"
      [totalPages]="total()"
      (turned)="turned.set($event)"
    />
  `,
})
class Host {
  readonly page = signal(1);
  readonly total = signal(3);
  readonly turned = signal<number | null>(null);
  readonly params = (page: number) => ({ page, state: 'open' });
}

async function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [
      provideRouter([]),
      { provide: UI_TEXT, useValue: { pagination: text } },
    ],
  });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const find = (selector: string) => el.querySelector(selector) as HTMLElement;
  return { fixture, find };
}

describe('Pagination', () => {
  it('names the nav by the page it is on', async () => {
    const { find } = await render();

    expect(find('.linked nav').getAttribute('aria-label')).toBe('Page 1 of 3');
    expect(find('.linked nav').textContent).toContain('Page 1 of 3');
  });

  it('links the next page with its query, and leaves the first step as words', async () => {
    const { find } = await render();

    expect(find('.linked a').getAttribute('href')).toBe(
      '/orders?page=2&state=open',
    );
    expect(find('.linked a').textContent).toContain('Next');
    expect(find('.linked span[appButtonBox]').textContent).toContain(
      'Previous',
    );
  });

  it('hands the page back where there is no link', async () => {
    const { fixture, find } = await render();

    find('.local button').click();

    expect(fixture.componentInstance.turned()).toBe(2);
  });

  it('draws nothing for a single page', async () => {
    const { fixture, find } = await render();

    fixture.componentInstance.total.set(1);
    fixture.detectChanges();

    expect(find('.linked nav')).toBeNull();
    expect(find('.linked').classList).toContain('empty:hidden');
  });
});
