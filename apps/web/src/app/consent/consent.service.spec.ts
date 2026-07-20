import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  DEPLOYMENT_CONFIG,
  DeploymentConfig,
} from '../config/deployment-config';
import { ConsentDecision, ConsentService } from './consent.service';

const STORAGE_KEY = 'cookie-consent';

/** Configure DI and resolve the singleton with the given flag + platform. */
function service(
  cookieConsentEnabled: boolean,
  platformId = 'browser',
): ConsentService {
  const config: DeploymentConfig = {
    branding: { name: 'Test', logo: '/logo.svg' },
    cookieConsentEnabled,
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: DEPLOYMENT_CONFIG, useValue: config },
      { provide: PLATFORM_ID, useValue: platformId },
    ],
  });
  return TestBed.inject(ConsentService);
}

function storedDecision(): ConsentDecision | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as ConsentDecision) : null;
}

describe('ConsentService', () => {
  beforeEach(() => localStorage.clear());

  it('is inert when the deployment flag is off — never asks, even undecided', () => {
    const consent = service(false);
    expect(consent.enabled).toBe(false);
    expect(consent.needsDecision()).toBe(false);
  });

  it('asks for a decision when enabled and nothing is stored', () => {
    const consent = service(true);
    expect(consent.needsDecision()).toBe(true);
    expect(consent.choice()).toBeNull();
  });

  it('persists an accept as a versioned record and stops asking', () => {
    const consent = service(true);
    consent.accept();

    expect(consent.choice()).toBe('accepted');
    expect(consent.needsDecision()).toBe(false);

    const stored = storedDecision();
    expect(stored?.choice).toBe('accepted');
    expect(stored?.version).toBe(1);
    expect(typeof stored?.timestamp).toBe('string');
  });

  it('persists a reject', () => {
    const consent = service(true);
    consent.reject();

    expect(consent.choice()).toBe('rejected');
    expect(consent.needsDecision()).toBe(false);
    expect(storedDecision()?.choice).toBe('rejected');
  });

  it('restores an existing valid record on startup', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        choice: 'accepted',
        timestamp: new Date().toISOString(),
      }),
    );
    const consent = service(true);

    expect(consent.needsDecision()).toBe(false);
    expect(consent.choice()).toBe('accepted');
  });

  it('re-asks after a policy version bump (stale record ignored)', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 0,
        choice: 'accepted',
        timestamp: new Date().toISOString(),
      }),
    );
    const consent = service(true);

    expect(consent.needsDecision()).toBe(true);
    expect(consent.choice()).toBeNull();
  });

  it('ignores a corrupt record instead of throwing', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json{');
    const consent = service(true);

    expect(consent.needsDecision()).toBe(true);
  });

  it('withdraw clears the record and re-asks', () => {
    const consent = service(true);
    consent.accept();

    consent.withdraw();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(consent.choice()).toBeNull();
    expect(consent.needsDecision()).toBe(true);
  });

  it('never touches localStorage on the server', () => {
    const consent = service(true, 'server');
    consent.accept();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
