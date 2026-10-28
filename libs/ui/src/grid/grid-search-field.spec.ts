import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { GridSearchField } from './grid-search-field';

@Component({
  imports: [GridSearchField],
  template: `<app-grid-search-field [query]="query()" />`,
})
class Host {
  readonly query = signal('');
}

/*
 * The navigation is stubbed out, so the URL never moves on its own: the host's
 * `query` stands in for it, and a test decides when a navigation "lands".
 */
function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [provideRouter([{ path: '**', children: [] }])],
  });
  const navigate = vi
    .spyOn(TestBed.inject(Router), 'navigate')
    .mockResolvedValue(true);
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const input = (fixture.nativeElement as HTMLElement).querySelector(
    'input',
  ) as HTMLInputElement;
  return { fixture, input, navigate };
}

function type(
  fixture: ComponentFixture<Host>,
  input: HTMLInputElement,
  text: string,
) {
  input.value = text;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function pause(fixture: ComponentFixture<Host>) {
  vi.advanceTimersByTime(200);
  fixture.detectChanges();
}

function land(fixture: ComponentFixture<Host>, query: string) {
  fixture.componentInstance.query.set(query);
  fixture.detectChanges();
}

const sentTerms = (navigate: ReturnType<typeof render>['navigate']) =>
  navigate.mock.calls.map(
    ([, extras]) => (extras?.queryParams as { searchTerm: unknown }).searchTerm,
  );

describe('GridSearchField (FR-ADM-05)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('navigates once the typing pauses', () => {
    const { fixture, input, navigate } = render();

    type(fixture, input, 'ab');
    expect(navigate).not.toHaveBeenCalled();
    pause(fixture);

    expect(sentTerms(navigate)).toEqual(['ab']);
  });

  // The bug: a letter typed while the navigation was in flight was overwritten
  // by the query arriving, and never sent.
  it('keeps letters typed while its own navigation is in flight', () => {
    const { fixture, input, navigate } = render();

    type(fixture, input, 'ab');
    pause(fixture);
    type(fixture, input, 'abc');
    land(fixture, 'ab');

    expect(input.value).toBe('abc');
    pause(fixture);
    expect(sentTerms(navigate)).toEqual(['ab', 'abc']);
  });

  it('takes a query that changed elsewhere', () => {
    const { fixture, input } = render();

    type(fixture, input, 'ab');
    pause(fixture);
    land(fixture, 'ab');
    land(fixture, 'tea');

    expect(input.value).toBe('tea');
  });

  // Once its own navigation has arrived, the same query coming back later is
  // someone else's — the back button after "clear filters", say.
  it('takes its own earlier query back once that has landed', () => {
    const { fixture, input } = render();

    type(fixture, input, 'ab');
    pause(fixture);
    land(fixture, 'ab');
    land(fixture, '');
    expect(input.value).toBe('');

    land(fixture, 'ab');
    expect(input.value).toBe('ab');
  });
});
