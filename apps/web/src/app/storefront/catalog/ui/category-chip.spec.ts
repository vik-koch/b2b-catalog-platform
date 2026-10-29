import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CategoryChip, CategoryChipTarget } from './category-chip';

const mark = { full: '/media/mark.png', thumb: '/media/mark-thumb.png' };

function category(over: Partial<CategoryChipTarget> = {}): CategoryChipTarget {
  return {
    slug: 'espresso',
    name: 'Espresso Roasts',
    shortName: null,
    mark: null,
    ...over,
  };
}

async function renderFixture(
  target: CategoryChipTarget,
): Promise<ComponentFixture<CategoryChip>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CategoryChip],
    providers: [provideRouter([])],
  });
  const fixture = TestBed.createComponent(CategoryChip);
  fixture.componentRef.setInput('category', target);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

async function render(target: CategoryChipTarget): Promise<HTMLElement> {
  return (await renderFixture(target)).nativeElement as HTMLElement;
}

describe('CategoryChip', () => {
  it('shows the name, and the nickname where there is one', async () => {
    expect((await render(category())).textContent).toContain('Espresso Roasts');
    expect(
      (await render(category({ shortName: 'Espresso' }))).textContent,
    ).toContain('Espresso');
  });

  it('shows the mark beside the name', async () => {
    const el = await render(category({ mark }));

    expect(el.querySelector('img')?.getAttribute('src')).toBe(mark.thumb);
    expect(el.textContent).toContain('Espresso Roasts');
  });
});
