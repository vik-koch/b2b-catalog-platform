import { TestBed } from '@angular/core/testing';
import { fillText } from '@b2b-catalog-platform/shared';
import { ProductAttribute } from '@b2b-catalog-platform/shared/core/catalog';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { defaultAdminText } from '../../../shared/config/admin-text.fixture';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { defaultSharedText } from '../../../shared/config/shared-text.fixture';
import { AttributeRowMarks } from './attribute-hints';
import { ProductAttributesNarrow } from './product-attributes-narrow';

const text = defaultAdminText.products.editor.attributes;
const plain: AttributeRowMarks = {
  filterable: false,
  stray: null,
  notNumeric: false,
  unit: null,
};

function render(rows: ProductAttribute[], marks: AttributeRowMarks[]) {
  TestBed.configureTestingModule({
    imports: [ProductAttributesNarrow],
    providers: [
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: SHARED_TEXT, useValue: defaultSharedText },
    ],
  });
  const fixture = TestBed.createComponent(ProductAttributesNarrow);
  fixture.componentRef.setInput('value', rows);
  fixture.componentRef.setInput('marks', marks);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const badge = (label: string) =>
    el.querySelector(`[aria-label="${CSS.escape(label)}"]`);
  return { el, badge };
}

describe('ProductAttributesNarrow', () => {
  it('shows each row the marks it was handed', () => {
    const { el, badge } = render(
      [
        { key: 'Weight', value: '1000' },
        { key: 'Colour', value: 'red' },
      ],
      [{ ...plain, filterable: true, unit: 'g' }, plain],
    );

    const [weight, colour] = [...el.querySelectorAll('li')];
    expect(weight.querySelector(`[aria-label="${text.filterable}"]`)).not.toBe(
      null,
    );
    expect(weight.textContent).toContain('g');
    expect(colour.querySelector(`[aria-label="${text.filterable}"]`)).toBe(
      null,
    );
    expect(badge(text.notNumeric)).toBe(null);
  });

  it('warns about a value that is not a number instead of naming the unit', () => {
    const { badge } = render(
      [{ key: 'Weight', value: 'heavy' }],
      [{ ...plain, filterable: true, notNumeric: true, unit: 'g' }],
    );

    expect(badge(text.notNumeric)).not.toBe(null);
  });

  it('names the stray part and the filter it misses', () => {
    const stray = { part: 'Cup', key: 'Colour' };
    const { badge } = render(
      [{ key: 'Colour (Cup)', value: 'red' }],
      [{ ...plain, stray }],
    );

    expect(badge(fillText(text.strayPart, stray))).not.toBe(null);
  });
});
