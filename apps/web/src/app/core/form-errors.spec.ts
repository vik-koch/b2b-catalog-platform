import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormBuilder, Validators } from '@angular/forms';
import { FieldErrors } from './form-errors';

// A stricter rule than Validators.email, which accepts a domain with no TLD —
// the point here is the *timing*, so the rule has to actually reject "j".
const EMAIL = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;

/** FieldErrors unsubscribes with takeUntilDestroyed, so it needs a host. */
@Component({ template: '' })
class Host {
  private readonly fb = inject(FormBuilder);
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.pattern(EMAIL)]],
    name: ['', Validators.required],
  });
  readonly errors = new FieldErrors(this.form);
}

function setUp() {
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  const email = host.form.controls.email;
  const name = host.form.controls.name;
  // What the browser does: a value change on input, `touched` on blur.
  const type = (value: string) => email.setValue(value);
  const leave = () => email.markAsTouched();
  return { host, email, name, type, leave };
}

describe('FieldErrors', () => {
  it('says nothing about a field nobody has touched', () => {
    const { host, email } = setUp();

    expect(host.errors.show(email)).toBe(false);
  });

  // Tabbing through a form to see what it asks for is not a mistake.
  it('stays quiet about an empty required field that was merely visited', () => {
    const { host, name } = setUp();
    name.markAsTouched();

    expect(host.errors.show(name)).toBe(false);
  });

  it('reports every missing field once the form is submitted', () => {
    const { host, name } = setUp();
    host.errors.markSubmitted();

    expect(host.errors.show(name)).toBe(true);
  });

  // "j" is not a wrong address, it is an unfinished one.
  it('withholds a format error while the field is still being typed in', () => {
    const { host, email, type } = setUp();
    type('j');

    expect(host.errors.show(email)).toBe(false);
  });

  it('reports a format error once the field has been left', () => {
    const { host, email, type, leave } = setUp();
    type('jane@example');
    leave();

    expect(host.errors.show(email)).toBe(true);
  });

  // The bug this class exists for: `touched` latches, so a revealed field used
  // to stay revealed and scolded the visitor from the first keystroke of a
  // fresh attempt.
  it('goes quiet again when the visitor clears the field and starts over', () => {
    const { host, email, type, leave } = setUp();
    type('jane@example');
    leave();
    expect(host.errors.show(email)).toBe(true);

    type('');
    type('j');

    expect(host.errors.show(email)).toBe(false);
  });

  it('reveals again on the next blur of a field that is still wrong', () => {
    const { host, email, type, leave } = setUp();
    type('jane@example');
    leave();
    type('jane@example2');
    expect(host.errors.show(email)).toBe(false);

    leave();

    expect(host.errors.show(email)).toBe(true);
  });

  // Reward the correction immediately: no waiting for another blur.
  it('clears as soon as the value becomes valid', () => {
    const { host, email, type, leave } = setUp();
    type('jane@example');
    leave();

    type('jane@example.com');

    expect(host.errors.show(email)).toBe(false);
    host.errors.markSubmitted();
    expect(host.errors.show(email)).toBe(false);
  });

  // A form that stays on screen after a successful submit is emptied for
  // reuse; the emptied required fields must not accuse the user of anything.
  it('goes quiet again when the form is reset after a success', () => {
    const { host, email, name, type } = setUp();
    type('jane@example');
    host.errors.markSubmitted();
    expect(host.errors.show(email)).toBe(true);
    expect(host.errors.show(name)).toBe(true);

    host.form.reset();
    host.errors.reset();

    expect(host.errors.show(email)).toBe(false);
    expect(host.errors.show(name)).toBe(false);
  });

  // After a failed submit the form speaks for every field, including ones the
  // visitor is in the middle of retyping — they have asked for the verdict.
  it('keeps reporting after a submit, even mid-retype', () => {
    const { host, email, type } = setUp();
    host.errors.markSubmitted();
    type('j');

    expect(host.errors.show(email)).toBe(true);
  });
});
