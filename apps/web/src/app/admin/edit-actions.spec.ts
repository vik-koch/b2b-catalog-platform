import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EditActions } from './edit-actions';

function render(inputs: Record<string, unknown>) {
  TestBed.configureTestingModule({
    imports: [EditActions],
    providers: [provideRouter([])],
  });
  const fixture = TestBed.createComponent(EditActions);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('EditActions', () => {
  it('puts the list first and the pencil second, wherever the page is', () => {
    const el = render({
      listLink: ['/admin/products'],
      listParams: { category: 'tools' },
      listLabel: 'Show in product list',
      editLink: ['/admin/categories', 'tools', 'edit'],
      editLabel: 'Edit category',
      filtersLink: ['/admin/categories', 'tools', 'filters'],
      filtersLabel: 'Edit filters',
    });

    const links = el.querySelectorAll('a');
    expect(links[0].getAttribute('aria-label')).toBe('Show in product list');
    expect(links[0].getAttribute('href')).toBe(
      '/admin/products?category=tools',
    );
    expect(links[1].getAttribute('aria-label')).toBe('Edit category');
    expect(links[2].getAttribute('aria-label')).toBe('Edit filters');
  });

  it('draws no list disc where none is asked for', () => {
    const el = render({
      editLink: ['/admin/products', 'hammer', 'edit'],
      editLabel: 'Edit product',
    });

    expect(el.querySelector('[aria-label="Show in product list"]')).toBeNull();
    expect(el.querySelectorAll('a')).toHaveLength(1);
  });
});
