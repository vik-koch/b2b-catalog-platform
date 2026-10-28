import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, RouterLink } from '@angular/router';
import { ActionLink } from './action-link';

@Component({
  imports: [ActionLink, RouterLink],
  template: `
    <a uiActionLink routerLink="/orders" [queryParams]="{ status: 'open' }">
      3 orders to confirm
    </a>
  `,
})
class Host {}

async function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [provideRouter([])],
  });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).querySelector(
    'a',
  ) as HTMLAnchorElement;
}

describe('ActionLink', () => {
  it('keeps the caller’s link and query on the anchor', async () => {
    const link = await render();

    expect(link.getAttribute('href')).toBe('/orders?status=open');
    expect(link.classList).toContain('text-warning');
  });

  it('names the link by its sentence alone', async () => {
    const link = await render();
    const decoration = link.querySelectorAll('[aria-hidden="true"]');

    expect(decoration).toHaveLength(2);
    expect(link.textContent).toContain('3 orders to confirm');
  });
});
