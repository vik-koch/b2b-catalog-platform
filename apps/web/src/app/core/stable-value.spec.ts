import { Resource, ResourceStatus, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { stableValue } from './stable-value';

/**
 * A stand-in for the parts of a resource this helper reads. The real thing
 * needs an HTTP round trip to reach each state; the states themselves are what
 * is under test.
 */
function fakeResource<T>() {
  const value = signal<T | undefined>(undefined);
  const error = signal<Error | undefined>(undefined);

  const resource = {
    value: (() => {
      const v = value();
      if (error()) throw error();
      return v;
    }) as Resource<T>['value'],
    error,
    hasValue: (() =>
      value() !== undefined && !error()) as Resource<T>['hasValue'],
    isLoading: signal(false),
    status: signal<ResourceStatus>('idle'),
    reload: () => false,
  } as unknown as Resource<T>;

  return { resource, value, error };
}

describe('stableValue', () => {
  it('holds the last value while the next load is in flight', () => {
    const { resource, value } = fakeResource<string>();
    const shown = TestBed.runInInjectionContext(() => stableValue(resource));

    value.set('first');
    expect(shown()).toBe('first');

    // A reload clears the resource's own value; the view keeps the old one.
    value.set(undefined);
    expect(shown()).toBe('first');

    value.set('second');
    expect(shown()).toBe('second');
  });

  it('drops the stale value when the load fails', () => {
    const { resource, value, error } = fakeResource<string>();
    const shown = TestBed.runInInjectionContext(() => stableValue(resource));

    value.set('first');
    expect(shown()).toBe('first');

    error.set(new Error('nope'));
    expect(shown()).toBeUndefined();
  });

  it('is undefined before anything has loaded', () => {
    const { resource } = fakeResource<string>();
    const shown = TestBed.runInInjectionContext(() => stableValue(resource));

    expect(shown()).toBeUndefined();
  });
});
