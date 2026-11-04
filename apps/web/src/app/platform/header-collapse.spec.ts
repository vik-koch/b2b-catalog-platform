import { TestBed } from '@angular/core/testing';
import { HeaderCollapse } from './header-collapse';

describe('HeaderCollapse', () => {
  it('collapses past the threshold and only comes back at the very top', () => {
    const collapse = TestBed.inject(HeaderCollapse);

    expect(collapse.collapsed()).toBe(false);
    collapse.update(96);
    expect(collapse.collapsed()).toBe(false);

    collapse.update(97);
    expect(collapse.collapsed()).toBe(true);

    // Mid-page the bar would slide down over what is being read.
    collapse.update(1);
    expect(collapse.collapsed()).toBe(true);

    collapse.update(0);
    expect(collapse.collapsed()).toBe(false);
  });
});
