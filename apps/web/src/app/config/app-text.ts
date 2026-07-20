import {
  inject,
  InjectionToken,
  makeStateKey,
  Provider,
  TransferState,
} from '@angular/core';

/**
 * Frontend-only UI text — the human-readable chrome wording (nav labels,
 * consent copy, error messages, taglines). A single-locale catalog: each
 * deployment ships its one language's text here (i18n is out of scope). Kept
 * separate from DeploymentConfig so growing text has its own home and a
 * deployment can override the whole catalog as one unit.
 *
 * Delivered SSR → browser via TransferState (see app-text.server.ts), so a
 * per-deployment override is a runtime concern, not a rebuild. Non-secret by
 * construction: the browser renders it.
 *
 * Grouped by area (`nav.about`, not `navAbout`) so it reads as it grows.
 */
export interface AppText {
  readonly brand: {
    readonly tagline: string;
  };
  /** Keyed by page slug (see PAGE_SLUGS). */
  readonly nav: Readonly<Record<string, string>>;
  readonly consent: {
    readonly message: string;
    readonly policyLink: string;
    readonly accept: string;
    readonly reject: string;
    readonly settings: string;
  };
  readonly errors: {
    readonly notFoundTitle: string;
    readonly notFoundBody: string;
    readonly notFoundBack: string;
    readonly cannotLoadTitle: string;
    readonly cannotLoadBody: string;
  };
}

/** Demo-shop English catalog; also the browser fallback if no transfer state. */
export const defaultAppText: AppText = {
  brand: { tagline: 'wholesale specialty coffee, Hamburg.' },
  nav: {
    about: 'About us',
    conditions: 'Payment & delivery',
    privacy: 'Privacy',
    imprint: 'Imprint',
  },
  consent: {
    message: 'We use only strictly necessary cookies to run this site. See our',
    policyLink: 'privacy policy',
    accept: 'Accept',
    reject: 'Reject',
    settings: 'Cookie settings',
  },
  errors: {
    notFoundTitle: 'Page not found',
    notFoundBody: 'The page you are looking for does not exist.',
    notFoundBack: 'Back to home',
    cannotLoadTitle: 'Cannot load page',
    cannotLoadBody:
      'Something went wrong while loading this page — please try again later.',
  },
};

export const APP_TEXT = new InjectionToken<AppText>('APP_TEXT');

export const APP_TEXT_STATE_KEY = makeStateKey<AppText>('appText');

/** Browser provider: reads the text the server serialized into the HTML. */
export function provideAppText(): Provider {
  return {
    provide: APP_TEXT,
    useFactory: () =>
      inject(TransferState).get(APP_TEXT_STATE_KEY, defaultAppText),
  };
}
