import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { UnpublishedCount } from './unpublished-count';

function render(count: number) {
  TestBed.configureTestingModule({
    imports: [UnpublishedCount],
    providers: [
      provideRouter([]),
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
    ],
  });
  const fixture = TestBed.createComponent(UnpublishedCount);
  fixture.componentRef.setInput('count', count);
  fixture.componentRef.setInput('query', { categoryId: 'cat-1' });
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('UnpublishedCount', () => {
  it('says how many are unpublished, linking to exactly those', () => {
    const el = render(4);

    const link = el.querySelector('a');
    expect(link?.textContent?.trim()).toBe(
      defaultAdminText.common.unpublishedProducts.replace('{count}', '4'),
    );
    const href = link?.getAttribute('href') ?? '';
    expect(href).toContain('/admin/products');
    expect(href).toContain('categoryId=cat-1');
    expect(href).toContain('state=unpublished');
  });

  it('renders nothing at zero', () => {
    const el = render(0);

    expect(el.querySelector('a')).toBeNull();
    expect(el.textContent?.trim()).toBe('');
  });
});
