import { provideTestGridText, testGridText } from './grid-text.testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GridHeader } from './grid-header';

const clearLabel = testGridText.clearFilters;

/** A caller, since the actions are projected rather than configured. */
@Component({
  imports: [GridHeader],
  template: `
    <ui-grid-header title="Products" [intro]="intro" [filtered]="filtered">
      <a href="/admin/products/new">Add product</a>
    </ui-grid-header>
  `,
})
class Host {
  filtered = false;
  intro: string | undefined = undefined;
}

function render(filtered: boolean, intro?: string) {
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [...provideTestGridText(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.filtered = filtered;
  fixture.componentInstance.intro = intro;
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const clear = el.querySelector<HTMLElement>(`[aria-label="${clearLabel}"]`);
  if (!clear) throw new Error('no clear-filters control');
  return { fixture, el, clear };
}

describe('GridHeader', () => {
  it('shows the title, the search box and the projected actions', () => {
    const { el } = render(false);

    expect(el.querySelector('h1')?.textContent).toContain('Products');
    expect(el.querySelector('input[type="search"]')).not.toBeNull();
    expect(el.textContent).toContain('Add product');
  });

  // An intro is the deployment's to write: where it wrote none, no empty
  // paragraph holds the space under the heading.
  it('draws the intro only where there is one', () => {
    expect(render(false).el.querySelector('p')).toBeNull();
    TestBed.resetTestingModule();
    expect(
      render(false, 'Every product, published or not.').el.textContent,
    ).toContain('Every product, published or not.');
  });

  /*
   * The way back to the whole list sits beside the search box, glyph-sized and
   * always there. It used to be a labelled button in the row of actions,
   * reserved as an invisible spacer so the box would not move when it appeared
   * — which pushed the page's own "Add" button a line below the box it was
   * meant to sit beside. Inert is now a real disabled button rather than a
   * hidden link: the difference is whether it can be tabbed to and pressed.
   */
  it('keeps the clear-filters control inert while nothing is filtered', () => {
    const { clear } = render(false);

    expect(clear.tagName).toBe('BUTTON');
    expect(clear.hasAttribute('disabled')).toBe(true);
  });

  it('turns it into a real control once the list is filtered', () => {
    const { clear } = render(true);

    expect(clear.hasAttribute('disabled')).toBe(false);
  });

  it('gives the title the search column when the grid has no search box', () => {
    @Component({
      imports: [GridHeader],
      template: `<ui-grid-header title="Runs" [searchable]="false" />`,
    })
    class Unsearchable {}

    TestBed.configureTestingModule({
      imports: [Unsearchable],
      providers: [...provideTestGridText(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(Unsearchable);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('input[type="search"]')).toBeNull();
    expect(el.querySelector('h1')?.classList).toContain('md:col-span-2');
  });
});
