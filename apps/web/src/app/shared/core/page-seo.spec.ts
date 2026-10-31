import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { usePageSeo } from './page-seo';

const hidden = signal(false);

@Component({ template: '' })
class FixedPage {
  constructor() {
    usePageSeo({ name: () => 'Page', noindex: true });
  }
}

@Component({ template: '' })
class LatePage {
  constructor() {
    usePageSeo({ name: () => 'Page', noindex: () => hidden() });
  }
}

const robots = () => TestBed.inject(Meta).getTag('name="robots"')?.content;

beforeEach(() => {
  hidden.set(false);
  TestBed.configureTestingModule({
    providers: [
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
    ],
  });
  TestBed.inject(Meta).removeTag('name="robots"');
});

describe('usePageSeo noindex', () => {
  it('marks the page and unmarks it on the way out', () => {
    const fixture = TestBed.createComponent(FixedPage);
    fixture.detectChanges();
    expect(robots()).toBe('noindex');
    fixture.destroy();
    expect(robots()).toBeUndefined();
  });

  it("leaves a non-indexable deployment's own tag as it is", () => {
    TestBed.inject(Meta).addTag({
      name: 'robots',
      content: 'noindex, nofollow',
    });
    const fixture = TestBed.createComponent(FixedPage);
    fixture.detectChanges();
    expect(robots()).toBe('noindex, nofollow');
    fixture.destroy();
    expect(robots()).toBe('noindex, nofollow');
  });

  it('follows a page that learns late whether it is hidden', () => {
    const fixture = TestBed.createComponent(LatePage);
    fixture.detectChanges();
    expect(robots()).toBeUndefined();
    hidden.set(true);
    fixture.detectChanges();
    expect(robots()).toBe('noindex');
    hidden.set(false);
    fixture.detectChanges();
    expect(robots()).toBeUndefined();
  });
});
