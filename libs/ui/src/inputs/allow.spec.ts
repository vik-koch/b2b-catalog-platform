import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Allow } from './allow';

@Component({
  imports: [Allow],
  template: `<input type="text" [uiAllow]="twoDigits" />`,
})
class Host {
  readonly twoDigits = (next: string) => /^\d{0,2}$/.test(next);
}

function render(value: string) {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const input = fixture.nativeElement.querySelector(
    'input',
  ) as HTMLInputElement;
  input.value = value;
  input.setSelectionRange(value.length, value.length);
  const keystroke = (data: string | null, inputType = 'insertText') => {
    const event = new InputEvent('beforeinput', {
      data,
      inputType,
      cancelable: true,
    });
    input.dispatchEvent(event);
    return event.defaultPrevented;
  };
  return { keystroke };
}

describe('Allow', () => {
  it('lets through a keystroke the rule allows', () => {
    expect(render('1').keystroke('2')).toBe(false);
  });

  it('refuses one that would break the rule', () => {
    expect(render('12').keystroke('3')).toBe(true);
    expect(render('1').keystroke('x')).toBe(true);
  });

  // Deleting can only shorten what the rule already allowed.
  it('never refuses a deletion', () => {
    expect(render('12').keystroke(null, 'deleteContentBackward')).toBe(false);
  });
});
