import { TestBed } from '@angular/core/testing';
import { DateField } from './date-field';

/**
 * The app's one date control, now that two screens share it: a customer's
 * preferred delivery day and an admin's certificate expiry. What is worth
 * pinning is the contract between them — ISO days in, ISO days or null out —
 * and the empty state, which is the whole reason this is not a bare `<input
 * type="date">`.
 */
async function render(
  options: { value?: string | null; placeholder?: string; min?: string } = {},
) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [DateField] });

  const fixture = TestBed.createComponent(DateField);
  fixture.componentRef.setInput('value', options.value ?? null);
  if (options.placeholder) {
    fixture.componentRef.setInput('placeholder', options.placeholder);
  }
  if (options.min) fixture.componentRef.setInput('min', options.min);
  await fixture.whenStable();
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const input = el.querySelector('input') as HTMLInputElement;
  return { fixture, el, input };
}

describe('DateField', () => {
  it('shows the day it was given', async () => {
    const { input } = await render({ value: '2026-09-05' });

    expect(input.type).toBe('date');
    expect(input.value).toBe('2026-09-05');
  });

  // A native date input takes no placeholder and draws a different thing in
  // every engine — on iOS, nothing at all — so the field draws its own.
  it('draws its own placeholder over an empty field', async () => {
    const { el } = await render({ placeholder: 'dd.mm.yyyy' });

    expect(el.textContent).toContain('dd.mm.yyyy');
  });

  it('takes the placeholder away once there is a date', async () => {
    const { el } = await render({
      value: '2026-09-05',
      placeholder: 'dd.mm.yyyy',
    });

    expect(el.textContent).not.toContain('dd.mm.yyyy');
  });

  it('reports a picked day as an ISO day', async () => {
    const { fixture, input } = await render();
    const picked: (string | null)[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => picked.push(v));

    input.value = '2027-01-15';
    input.dispatchEvent(new Event('change'));

    expect(picked).toEqual(['2027-01-15']);
  });

  // Cleared rather than emptied: null is what every caller stores for "no
  // date", and an empty string would be a date nobody can read back.
  it('reports a cleared field as null', async () => {
    const { fixture, input } = await render({ value: '2027-01-15' });
    const picked: (string | null)[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => picked.push(v));

    input.value = '';
    input.dispatchEvent(new Event('change'));

    expect(picked).toEqual([null]);
  });

  it('passes a floor to the picker when it is given one', async () => {
    const { input } = await render({ min: '2026-09-07' });

    expect(input.getAttribute('min')).toBe('2026-09-07');
  });
});
