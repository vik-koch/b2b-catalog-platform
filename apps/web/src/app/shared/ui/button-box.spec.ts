import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Button } from './button';
import { ButtonBox } from './button-box';

@Component({
  imports: [Button, ButtonBox],
  template: `
    <p appButtonBox [class]="label()" role="status">Added</p>
    <button appButton variant="secondary" size="sm">Go</button>
  `,
})
class Host {
  readonly label = signal('mt-2 bg-secondary text-white');
}

async function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    label: el.querySelector('p') as HTMLElement,
    button: el.querySelector('button') as HTMLElement,
  };
}

describe('ButtonBox', () => {
  it('gives an element that takes a button’s place the button’s box', async () => {
    const { label } = await render();

    expect(label.classList).toContain('rounded-md');
    expect(label.classList).toContain('min-h-9');
    expect(label.classList).toContain('bg-secondary');
  });

  it('keeps its box when the element’s own classes change', async () => {
    const { fixture, label } = await render();

    fixture.componentInstance.label.set('bg-secondary text-white');
    fixture.detectChanges();

    expect(label.classList).not.toContain('mt-2');
    expect(label.classList).toContain('min-h-9');
  });

  it('is the box under every button, sized by the button’s input', async () => {
    const { button } = await render();

    expect(button.classList).toContain('rounded-md');
    expect(button.classList).toContain('min-h-8');
    expect(button.classList).not.toContain('min-h-9');
    expect(button.classList).toContain('border-edge-strong');
  });
});
