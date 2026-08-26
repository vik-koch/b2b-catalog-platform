import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AutoGrow } from './auto-grow';

@Component({
  imports: [AutoGrow],
  template: `<textarea appAutoGrow [value]="note()"></textarea>`,
})
class Host {
  readonly note = signal('one line');
}

async function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  return {
    fixture,
    field: fixture.nativeElement.querySelector(
      'textarea',
    ) as HTMLTextAreaElement,
  };
}

// The height is measured from the content, and a test DOM lays nothing out —
// what is asserted here is that the field is measured at all, and measured
// again when what is in it changes. How tall it comes out is the browser's.
describe('AutoGrow', () => {
  it('sizes the field on the first render, not on the first keystroke', async () => {
    const { field } = await render();

    expect(field.style.height).not.toBe('');
  });

  it('sizes it again when the value arrives from a binding', async () => {
    const { fixture, field } = await render();
    field.style.height = '999px';

    fixture.componentInstance.note.set('one line\nand another');
    await fixture.whenStable();

    expect(field.style.height).not.toBe('999px');
  });

  it('sizes it again as it is typed into', async () => {
    const { field } = await render();
    field.style.height = '999px';

    field.value = 'one line\nand another';
    field.dispatchEvent(new Event('input'));

    expect(field.style.height).not.toBe('999px');
  });
});
